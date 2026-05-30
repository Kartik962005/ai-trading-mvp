from __future__ import annotations

import base64
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import hmac
import json
import os
import secrets
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.supabase_client import supabase
from app.services.alert_service import _send_email
from app.services.daily_signal_engine import (
    DEFAULT_CONSENT_VERSION,
    adjusted_win_rate,
    build_feature_frame,
    build_signal_email,
    compute_expected_r,
    compute_final_score,
    detect_market_regime,
    diversify_candidates,
    evaluate_signal_outcome,
    evaluate_technical_setup,
    fetch_market_context,
    get_universe,
    predict_signal_probabilities,
    validate_candidate_frame,
    wilson_lower_bound_placeholder,
)
from app.services.daily_signal_engine.config import (
    ALLOW_MOCK_SIGNAL_DATA,
    COMPANY_NAME_BY_SYMBOL,
    DEFAULT_EMAIL_TIME,
    DEFAULT_MARKET,
    DEFAULT_RISK_LEVEL,
    DEFAULT_SIGNAL_TYPE,
    DEFAULT_K_SMOOTHING,
    MARKET_CLOSES,
    MAX_SELECTED_SIGNALS,
    MIN_EMAIL_AFTER_CLOSE_MINUTES,
    RISK_PROFILES,
    SECTOR_BY_SYMBOL,
    UNIVERSE_AVERAGE_WIN_RATE,
)
from app.services.daily_signal_engine.data_ingestion import fetch_price_history, get_symbol_metadata


IST = ZoneInfo("Asia/Kolkata")
PREFERENCE_TABLE = "notification_preferences"
MODEL_RUNS_TABLE = "model_runs"
SIGNALS_TABLE = "stock_signals"
OUTCOMES_TABLE = "signal_outcomes"
EMAIL_LOGS_TABLE = "email_logs"
AUDIT_LOGS_TABLE = "audit_logs"

_MEMORY_PREFERENCES: dict[str, dict[str, Any]] = {}
_MEMORY_RUNS: list[dict[str, Any]] = []
_MEMORY_SIGNALS: list[dict[str, Any]] = []
_MEMORY_OUTCOMES: list[dict[str, Any]] = []
_MEMORY_EMAIL_LOGS: list[dict[str, Any]] = []


def _is_missing_table_error(exc: Exception, table_name: str | None = None) -> bool:
    message = str(exc)
    if "PGRST205" not in message and "schema cache" not in message.lower():
        return False
    if not table_name:
        return True
    return table_name in message


def _should_use_memory_fallback(exc: Exception, table_name: str | None = None) -> bool:
    if _is_missing_table_error(exc, table_name):
        return True
    message = str(exc).lower()
    return (
        "connecterror" in message
        or "connection refused" in message
        or "timed out" in message
        or "forbidden by its access permissions" in message
        or "network is unreachable" in message
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _today_ist() -> date:
    return datetime.now(IST).date()


def _holiday_set() -> set[str]:
    raw = os.getenv("INDIA_MARKET_HOLIDAYS", "").strip()
    return {item.strip() for item in raw.split(",") if item.strip()}


def _is_market_holiday(day: date) -> bool:
    return day.weekday() >= 5 or day.isoformat() in _holiday_set()


def _next_trading_day(from_day: date | None = None) -> date:
    current = (from_day or _today_ist()) + timedelta(days=1)
    while _is_market_holiday(current):
        current += timedelta(days=1)
    return current


def _previous_trading_day(from_day: date | None = None) -> date:
    current = (from_day or _today_ist()) - timedelta(days=1)
    while _is_market_holiday(current):
        current -= timedelta(days=1)
    return current


def _parse_time_string(value: str | None) -> time:
    clean = (value or DEFAULT_EMAIL_TIME).strip()
    parsed = datetime.strptime(clean, "%H:%M")
    return parsed.time()


def _public_backend_base_url() -> str:
    return (
        os.getenv("PUBLIC_BACKEND_BASE_URL")
        or os.getenv("BACKEND_PUBLIC_URL")
        or "http://127.0.0.1:8000"
    ).rstrip("/")


def _unsubscribe_secret() -> str:
    return os.getenv("UNSUBSCRIBE_TOKEN_SECRET") or os.getenv("ALERT_ADMIN_KEY") or "dev-unsubscribe-secret"


def _default_preference(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": user["id"],
        "email": user.get("email"),
        "daily_stock_email_enabled": False,
        "market": DEFAULT_MARKET,
        "risk_level": DEFAULT_RISK_LEVEL,
        "email_time": DEFAULT_EMAIL_TIME,
        "signal_type": DEFAULT_SIGNAL_TYPE,
        "consent_version": None,
        "consent_accepted_at": None,
        "unsubscribed_at": None,
        "unsubscribe_nonce": None,
        "unsubscribe_token_hash": None,
        "created_at": _utc_now_iso(),
        "updated_at": _utc_now_iso(),
    }


def _supabase_required():
    if not supabase:
        raise ValueError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return supabase


def _normalize_market(value: str | None) -> str:
    market = (value or DEFAULT_MARKET).upper()
    if market not in MARKET_CLOSES:
        raise ValueError("Unsupported market.")
    return market


def _normalize_risk(value: str | None) -> str:
    risk = (value or DEFAULT_RISK_LEVEL).strip().title()
    if risk not in RISK_PROFILES:
        raise ValueError("Risk level must be Conservative, Balanced, or Aggressive.")
    return risk


def _normalize_signal_type(value: str | None) -> str:
    signal_type = (value or DEFAULT_SIGNAL_TYPE).strip()
    if signal_type not in {"Next-day swing", "Intraday", "Both"}:
        raise ValueError("Signal type must be Next-day swing, Intraday, or Both.")
    return signal_type


def _validate_email_time(market: str, value: str | None) -> str:
    parsed = _parse_time_string(value)
    close_time = MARKET_CLOSES[market]
    minimum = datetime.combine(date.today(), close_time) + timedelta(minutes=MIN_EMAIL_AFTER_CLOSE_MINUTES)
    preferred = datetime.combine(date.today(), parsed)
    if preferred < minimum:
        minimum_value = minimum.time().strftime("%H:%M")
        raise ValueError(f"Preferred email time must be after the market closes. Choose {minimum_value} IST or later.")
    return parsed.strftime("%H:%M")


def _build_unsubscribe_token(user_id: str, nonce: str) -> str:
    payload = f"{user_id}:{nonce}"
    signature = hmac.new(_unsubscribe_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    token_bytes = f"{payload}:{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(token_bytes).decode("utf-8").rstrip("=")


def _decode_unsubscribe_token(token: str) -> tuple[str, str]:
    padded = token + "=" * (-len(token) % 4)
    decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
    user_id, nonce, signature = decoded.split(":", 2)
    payload = f"{user_id}:{nonce}"
    expected = hmac.new(_unsubscribe_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid unsubscribe token.")
    return user_id, nonce


def _ensure_unsubscribe_token_fields(preference: dict[str, Any]) -> dict[str, Any]:
    if preference.get("unsubscribe_nonce"):
        return preference
    nonce = secrets.token_urlsafe(18)
    token = _build_unsubscribe_token(preference["user_id"], nonce)
    preference["unsubscribe_nonce"] = nonce
    preference["unsubscribe_token_hash"] = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return preference


def _unsubscribe_url(preference: dict[str, Any]) -> str:
    preference = _ensure_unsubscribe_token_fields(preference)
    token = _build_unsubscribe_token(preference["user_id"], preference["unsubscribe_nonce"])
    return f"{_public_backend_base_url()}/api/v1/unsubscribe?token={token}"


def _log_audit(action: str, entity_type: str, payload: dict[str, Any], user_id: str | None = None, entity_id: str | None = None):
    record = {
        "id": str(uuid4()),
        "user_id": user_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "payload": payload,
        "created_at": _utc_now_iso(),
    }
    if supabase:
        try:
            supabase.table(AUDIT_LOGS_TABLE).insert(record).execute()
            return
        except Exception as exc:
            if _should_use_memory_fallback(exc, AUDIT_LOGS_TABLE):
                print(f"[DailySignals] audit log table missing, using in-memory fallback: {exc}")
                return record
            print(f"[DailySignals] audit log failed: {exc}")
    return record


def _fetch_preference_row(user_id: str) -> dict[str, Any] | None:
    if supabase:
        try:
            response = (
                supabase.table(PREFERENCE_TABLE)
                .select("*")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            rows = getattr(response, "data", None) or []
            return rows[0] if rows else None
        except Exception as exc:
            if _should_use_memory_fallback(exc, PREFERENCE_TABLE):
                print(f"[DailySignals] notification preferences table missing, using in-memory fallback: {exc}")
                return _MEMORY_PREFERENCES.get(user_id)
            raise
    return _MEMORY_PREFERENCES.get(user_id)


def get_notification_preference(user: dict[str, Any]) -> dict[str, Any]:
    row = _fetch_preference_row(user["id"]) or _default_preference(user)
    row.setdefault("email", user.get("email"))
    row.setdefault("market", DEFAULT_MARKET)
    row.setdefault("risk_level", DEFAULT_RISK_LEVEL)
    row.setdefault("email_time", DEFAULT_EMAIL_TIME)
    row.setdefault("signal_type", DEFAULT_SIGNAL_TYPE)
    row.setdefault("daily_stock_email_enabled", False)
    return row


def _upsert_preference(preference: dict[str, Any]) -> dict[str, Any]:
    preference["updated_at"] = _utc_now_iso()
    preference = _ensure_unsubscribe_token_fields(preference)
    if supabase:
        try:
            response = supabase.table(PREFERENCE_TABLE).upsert(preference, on_conflict="user_id").execute()
            rows = getattr(response, "data", None) or []
            return rows[0] if rows else preference
        except Exception as exc:
            if not _should_use_memory_fallback(exc, PREFERENCE_TABLE):
                raise
            print(f"[DailySignals] notification preferences table missing during save, using in-memory fallback: {exc}")
    _MEMORY_PREFERENCES[preference["user_id"]] = preference
    return preference


def update_notification_preference(user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    current = get_notification_preference(user)
    market = _normalize_market(payload.get("market") or current.get("market"))
    risk_level = _normalize_risk(payload.get("risk_level") or current.get("risk_level"))
    signal_type = _normalize_signal_type(payload.get("signal_type") or current.get("signal_type"))
    email_time = _validate_email_time(market, payload.get("email_time") or current.get("email_time"))
    enabled = bool(payload.get("daily_stock_email_enabled", current.get("daily_stock_email_enabled")))
    clean_email = (payload.get("email") or user.get("email") or current.get("email") or "").strip()
    if enabled and "@" not in clean_email:
        raise ValueError("Daily stock emails need a valid account email.")

    current.update(
        {
            "email": clean_email,
            "market": market,
            "risk_level": risk_level,
            "email_time": email_time,
            "signal_type": signal_type,
            "daily_stock_email_enabled": enabled,
        }
    )
    if payload.get("consent_version"):
        current["consent_version"] = payload["consent_version"]
    if payload.get("consent_accepted_at"):
        current["consent_accepted_at"] = payload["consent_accepted_at"]
        current["unsubscribed_at"] = None
    saved = _upsert_preference(current)
    _log_audit("notification_preference_updated", "notification_preferences", saved, user_id=user["id"], entity_id=user["id"])
    return saved


def enable_daily_alerts(user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    consent_version = payload.get("consent_version") or DEFAULT_CONSENT_VERSION
    consent_accepted_at = payload.get("consent_accepted_at") or _utc_now_iso()
    preference = update_notification_preference(
        user,
        {
            **payload,
            "daily_stock_email_enabled": True,
            "consent_version": consent_version,
            "consent_accepted_at": consent_accepted_at,
        },
    )
    _log_audit("daily_alerts_enabled", "notification_preferences", preference, user_id=user["id"], entity_id=user["id"])
    return preference


def disable_daily_alerts(user: dict[str, Any]) -> dict[str, Any]:
    current = get_notification_preference(user)
    current["daily_stock_email_enabled"] = False
    saved = _upsert_preference(current)
    _log_audit("daily_alerts_disabled", "notification_preferences", saved, user_id=user["id"], entity_id=user["id"])
    return saved


def unsubscribe_daily_alerts(token: str) -> dict[str, Any]:
    user_id, nonce = _decode_unsubscribe_token(token)
    row = _fetch_preference_row(user_id)
    if not row or row.get("unsubscribe_nonce") != nonce:
        raise ValueError("That unsubscribe link is no longer valid.")
    row["daily_stock_email_enabled"] = False
    row["unsubscribed_at"] = _utc_now_iso()
    saved = _upsert_preference(row)
    _log_audit("daily_alerts_unsubscribed", "notification_preferences", saved, user_id=user_id, entity_id=user_id)
    return {"unsubscribed": True, "user_id": user_id}


def get_daily_update_preference(user: dict[str, Any]) -> dict[str, Any]:
    preference = get_notification_preference(user)
    return {
        "user_id": preference["user_id"],
        "email": preference.get("email"),
        "enabled": preference.get("daily_stock_email_enabled", False),
        "market": preference.get("market"),
        "risk_level": preference.get("risk_level"),
        "email_time": preference.get("email_time"),
        "signal_type": preference.get("signal_type"),
    }


def update_daily_update_preference(user: dict[str, Any], enabled: bool, email: str | None = None) -> dict[str, Any]:
    if enabled:
        return enable_daily_alerts(
            user,
            {
                "email": email or user.get("email"),
                "market": DEFAULT_MARKET,
                "risk_level": DEFAULT_RISK_LEVEL,
                "email_time": DEFAULT_EMAIL_TIME,
                "signal_type": DEFAULT_SIGNAL_TYPE,
                "consent_version": DEFAULT_CONSENT_VERSION,
                "consent_accepted_at": _utc_now_iso(),
            },
        )
    return disable_daily_alerts(user)


def _risk_profile(risk_level: str) -> dict[str, float]:
    return RISK_PROFILES.get(risk_level, RISK_PROFILES[DEFAULT_RISK_LEVEL])


def _setup_stats() -> dict[str, dict[str, int]]:
    stats: dict[str, dict[str, int]] = defaultdict(lambda: {"wins": 0, "trades": 0})
    if supabase:
        try:
            signal_rows = (
                supabase.table(SIGNALS_TABLE)
                .select("id,setup_type")
                .order("run_date", desc=True)
                .limit(600)
                .execute()
            )
            outcome_rows = (
                supabase.table(OUTCOMES_TABLE)
                .select("stock_signal_id,outcome")
                .limit(600)
                .execute()
            )
            setup_by_id = {row["id"]: row.get("setup_type") or "mixed_setup" for row in getattr(signal_rows, "data", None) or []}
            for outcome in getattr(outcome_rows, "data", None) or []:
                setup = setup_by_id.get(outcome.get("stock_signal_id"))
                if not setup:
                    continue
                stats[setup]["trades"] += 1
                if outcome.get("outcome") == "WIN":
                    stats[setup]["wins"] += 1
            return stats
        except Exception as exc:
            if not (_should_use_memory_fallback(exc, SIGNALS_TABLE) or _should_use_memory_fallback(exc, OUTCOMES_TABLE)):
                raise
            print(f"[DailySignals] signal stats tables missing, using in-memory fallback: {exc}")
    for signal in _MEMORY_SIGNALS:
        for outcome in _MEMORY_OUTCOMES:
            if outcome.get("stock_signal_id") != signal.get("id"):
                continue
            setup = signal.get("setup_type") or "mixed_setup"
            stats[setup]["trades"] += 1
            if outcome.get("outcome") == "WIN":
                stats[setup]["wins"] += 1
    return stats


def _liquidity_score(avg_turnover: float) -> float:
    return min(1.0, max(0.0, avg_turnover / 500_000_000))


def _risk_penalties(validation: dict[str, Any], atr_pct: float, risk_level: str) -> float:
    penalty = max(0.0, (1.0 - validation["quality_score"]) * 0.18)
    penalty += max(0.0, atr_pct - (_risk_profile(risk_level)["max_atr_pct"] / 100)) * 0.5
    return penalty * _risk_profile(risk_level)["risk_penalty_multiplier"]


def _risk_rank_score(
    *,
    risk_level: str,
    final_score: float,
    calibrated_pwin: float,
    expected_r: float,
    adjusted_setup_win_rate: float,
    model_stability: float,
    liquidity_score: float,
    relative_strength_norm: float,
    regime_alignment: float,
    chart_setup_quality: float,
    atr_pct: float,
    penalties: float,
) -> float:
    """Risk-aware ranking so each risk level surfaces a genuinely different
    shortlist instead of the same survivors reordered.

    - Conservative: rewards calibrated win-rate, historical setup win-rate,
      model stability and liquidity; PENALISES volatility.
    - Aggressive: rewards expected-R, relative strength and chart quality;
      TOLERATES (mildly rewards) volatility.
    - Balanced: keeps the standard final score.
    """
    vol_norm = min(1.0, max(0.0, atr_pct / 0.06))
    if risk_level == "Conservative":
        return (
            0.34 * calibrated_pwin
            + 0.22 * adjusted_setup_win_rate
            + 0.20 * model_stability
            + 0.14 * liquidity_score
            + 0.10 * regime_alignment
            - 0.18 * vol_norm
            - penalties
        )
    if risk_level == "Aggressive":
        return (
            0.26 * calibrated_pwin
            + 0.34 * max(expected_r, 0.0)
            + 0.16 * relative_strength_norm
            + 0.14 * chart_setup_quality
            + 0.10 * regime_alignment
            + 0.16 * vol_norm
            - 0.7 * penalties
        )
    return final_score


def _relative_strength(frame: pd.DataFrame, index_frame: pd.DataFrame) -> float:
    if len(frame) < 25 or len(index_frame) < 25:
        return 0.0
    stock_ret = float(frame["close"].iloc[-1] / frame["close"].iloc[-21] - 1)
    index_ret = float(index_frame["close"].iloc[-1] / index_frame["close"].iloc[-21] - 1)
    return (stock_ret - index_ret) * 100


def _build_candidate(
    *,
    ticker: str,
    feature_frame: pd.DataFrame,
    index_frame: pd.DataFrame,
    regime: dict[str, Any],
    sector_strength: float,
    setup_stats: dict[str, dict[str, int]],
    risk_level: str,
    signal_type: str,
) -> dict[str, Any] | None:
    latest = feature_frame.iloc[-1]
    close = float(latest["close"])
    atr = float(latest["atr14"])
    if close <= 0 or atr <= 0:
        return None

    validation = validate_candidate_frame(feature_frame, risk_level)
    if not validation["is_valid"]:
        return None

    relative_strength = _relative_strength(feature_frame, index_frame)
    technical_setup = evaluate_technical_setup(latest.to_dict(), relative_strength, sector_strength)
    probabilities = predict_signal_probabilities(
        technical_setup,
        regime,
        risk_level,
        relative_strength,
        validation["quality_score"],
    )

    profile = _risk_profile(risk_level)
    target_multiplier = profile["target_atr_multiplier"] * (0.9 if signal_type == "Intraday" else 1.0)
    stop_multiplier = profile["stop_atr_multiplier"] * (0.8 if signal_type == "Intraday" else 1.0)
    if signal_type == "Both":
        target_multiplier *= 1.05
        stop_multiplier *= 0.95

    if technical_setup["direction"] == "BUY":
        entry_low = close - atr * 0.15
        entry_high = close + atr * 0.2
        target_price = close + atr * target_multiplier
        stop_loss = close - atr * stop_multiplier
        target_r = max((target_price - close) / max(close - stop_loss, 1e-6), 0)
        stop_r = 1.0
    else:
        entry_low = close - atr * 0.2
        entry_high = close + atr * 0.15
        target_price = close - atr * target_multiplier
        stop_loss = close + atr * stop_multiplier
        target_r = max((close - target_price) / max(stop_loss - close, 1e-6), 0)
        stop_r = 1.0

    expected_r = compute_expected_r(
        probabilities["calibrated_pwin"],
        probabilities["p_loss"],
        target_r,
        stop_r,
        transaction_cost_r=0.03 if signal_type != "Intraday" else 0.04,
        slippage_r=0.02,
    )
    setup_stat = setup_stats.get(technical_setup["setup_type"], {"wins": 0, "trades": 0})
    setup_win_rate = adjusted_win_rate(
        setup_stat["wins"],
        setup_stat["trades"],
        UNIVERSE_AVERAGE_WIN_RATE,
        DEFAULT_K_SMOOTHING,
    )
    wilson_floor = wilson_lower_bound_placeholder(setup_stat["wins"], setup_stat["trades"]) if setup_stat["trades"] else UNIVERSE_AVERAGE_WIN_RATE * 0.8
    adjusted_setup_win_rate = min(setup_win_rate, max(wilson_floor, 0.0) + 0.12)
    avg_turnover = float(validation["avg_turnover"])
    liquidity_score = _liquidity_score(avg_turnover)
    risk_reward = target_r
    confidence = probabilities["confidence"]
    atr_pct = atr / close
    penalties = _risk_penalties(validation, atr_pct, risk_level)
    regime_alignment = regime["alignment_buy"] if technical_setup["direction"] == "BUY" else regime["alignment_sell"]

    relative_strength_norm = min(1.0, abs(relative_strength) / 5)
    final_score = compute_final_score(
        calibrated_pwin=probabilities["calibrated_pwin"],
        expected_r=expected_r,
        adjusted_setup_win_rate=adjusted_setup_win_rate,
        market_regime_alignment=regime_alignment,
        chart_setup_quality=technical_setup["chart_setup_quality"],
        relative_strength=relative_strength_norm,
        liquidity_score=liquidity_score,
        model_stability=probabilities["model_stability"],
        risk_penalties=penalties,
    )

    rank_score = _risk_rank_score(
        risk_level=risk_level,
        final_score=final_score,
        calibrated_pwin=probabilities["calibrated_pwin"],
        expected_r=expected_r,
        adjusted_setup_win_rate=adjusted_setup_win_rate,
        model_stability=probabilities["model_stability"],
        liquidity_score=liquidity_score,
        relative_strength_norm=relative_strength_norm,
        regime_alignment=regime_alignment,
        chart_setup_quality=technical_setup["chart_setup_quality"],
        atr_pct=atr_pct,
        penalties=penalties,
    )

    if expected_r <= 0 or confidence < profile["confidence_threshold"] or risk_reward < profile["min_risk_reward"]:
        return None

    returns = feature_frame["close"].pct_change().dropna().tail(90).tolist()
    meta = get_symbol_metadata(ticker)
    symbol = meta["symbol"]
    return {
        "symbol": symbol,
        "company_name": meta["company_name"],
        "sector": meta["sector"],
        "ticker": ticker,
        "direction": technical_setup["direction"],
        "entry_low": round(entry_low, 2),
        "entry_high": round(entry_high, 2),
        "target_price": round(target_price, 2),
        "stop_loss": round(stop_loss, 2),
        "confidence": round(confidence, 6),
        "expected_r": round(expected_r, 6),
        "risk_reward": round(risk_reward, 6),
        "final_score": round(final_score, 6),
        "rank_score": round(rank_score, 6),
        "setup_type": technical_setup["setup_type"],
        "reasons": technical_setup["reasons"],
        "relative_strength": round(relative_strength, 4),
        "liquidity_score": round(liquidity_score, 6),
        "model_stability": probabilities["model_stability"],
        "market_regime_alignment": round(regime_alignment, 6),
        "chart_setup_quality": technical_setup["chart_setup_quality"],
        "calibrated_pwin": probabilities["calibrated_pwin"],
        "data_quality_valid": True,
        "explanation_json": {
            "reasons": technical_setup["reasons"],
            "validation": validation,
            "probabilities": probabilities,
            "sector_strength": round(sector_strength, 4),
            "relative_strength": round(relative_strength, 4),
            "signal_type": signal_type,
            # Per-stock technical readings so the email can show real, distinct
            # values for each name instead of a fixed boilerplate sentence.
            "rsi": technical_setup["rsi"],
            "adx": technical_setup["adx"],
            "volume_ratio": technical_setup["volume_ratio"],
            "buy_score": technical_setup["buy_score"],
            "sell_score": technical_setup["sell_score"],
            "chart_setup_quality": technical_setup["chart_setup_quality"],
            "market_regime_alignment": round(regime_alignment, 6),
            "calibrated_pwin": probabilities.get("calibrated_pwin"),
        },
        "recent_returns": returns,
    }


def _group_sector_strength(feature_frames: dict[str, pd.DataFrame], index_frame: pd.DataFrame) -> dict[str, float]:
    sector_returns: dict[str, list[float]] = defaultdict(list)
    index_ret = float(index_frame["close"].iloc[-1] / index_frame["close"].iloc[-21] - 1) if len(index_frame) >= 25 else 0.0
    for ticker, frame in feature_frames.items():
        if len(frame) < 25:
            continue
        symbol = ticker.replace(".NS", "").replace(".BO", "")
        sector = SECTOR_BY_SYMBOL.get(symbol, "General")
        sector_returns[sector].append(float(frame["close"].iloc[-1] / frame["close"].iloc[-21] - 1))
    return {
        sector: ((sum(values) / len(values)) - index_ret) * 100
        for sector, values in sector_returns.items()
        if values
    }


def _store_model_run(run_payload: dict[str, Any], signals: list[dict[str, Any]]) -> dict[str, Any]:
    if supabase:
        try:
            run_record = {
                "id": run_payload["id"],
                "run_date": run_payload["run_date"],
                "target_date": run_payload["target_date"],
                "market": run_payload["market"],
                "risk_level": run_payload["risk_level"],
                "signal_type": run_payload["signal_type"],
                "model_version": run_payload["model_version"],
                "generated_at": run_payload["generated_at"],
                "universe_size": run_payload["universe_size"],
                "filtered_count": run_payload["filtered_count"],
                "selected_count": run_payload["selected_count"],
                "data_timestamp": run_payload["data_timestamp"],
                "status": run_payload["status"],
                "summary": run_payload["summary"],
            }
            supabase.table(MODEL_RUNS_TABLE).upsert(run_record, on_conflict="id").execute()
            for signal in signals:
                supabase.table(SIGNALS_TABLE).upsert(signal, on_conflict="id").execute()
            return run_payload
        except Exception as exc:
            if not (_should_use_memory_fallback(exc, MODEL_RUNS_TABLE) or _should_use_memory_fallback(exc, SIGNALS_TABLE)):
                raise
            print(f"[DailySignals] model run tables missing, using in-memory fallback: {exc}")
    else:
        pass
    _MEMORY_RUNS[:] = [item for item in _MEMORY_RUNS if item["id"] != run_payload["id"]]
    _MEMORY_RUNS.append(run_payload)
    existing_ids = {signal["id"] for signal in signals}
    _MEMORY_SIGNALS[:] = [item for item in _MEMORY_SIGNALS if item["id"] not in existing_ids]
    _MEMORY_SIGNALS.extend(signals)
    return run_payload


def _find_existing_run(run_date: str, market: str, risk_level: str, signal_type: str) -> dict[str, Any] | None:
    if supabase:
        try:
            response = (
                supabase.table(MODEL_RUNS_TABLE)
                .select("*")
                .eq("run_date", run_date)
                .eq("market", market)
                .eq("risk_level", risk_level)
                .eq("signal_type", signal_type)
                .order("generated_at", desc=True)
                .limit(1)
                .execute()
            )
            rows = getattr(response, "data", None) or []
            return rows[0] if rows else None
        except Exception as exc:
            if not _should_use_memory_fallback(exc, MODEL_RUNS_TABLE):
                raise
            print(f"[DailySignals] model runs table missing during lookup, using in-memory fallback: {exc}")
    matches = [
        item for item in _MEMORY_RUNS
        if item["run_date"] == run_date and item["market"] == market and item["risk_level"] == risk_level and item["signal_type"] == signal_type
    ]
    return sorted(matches, key=lambda item: item["generated_at"], reverse=True)[0] if matches else None


def _load_signals_for_run(run_id: str) -> list[dict[str, Any]]:
    if supabase:
        try:
            response = (
                supabase.table(SIGNALS_TABLE)
                .select("*")
                .eq("model_run_id", run_id)
                .order("signal_rank")
                .execute()
            )
            return getattr(response, "data", None) or []
        except Exception as exc:
            if not _should_use_memory_fallback(exc, SIGNALS_TABLE):
                raise
            print(f"[DailySignals] stock signals table missing during load, using in-memory fallback: {exc}")
    return sorted([item for item in _MEMORY_SIGNALS if item["model_run_id"] == run_id], key=lambda item: item.get("signal_rank", 999))


def run_daily_prediction(
    *,
    market: str = DEFAULT_MARKET,
    risk_level: str = DEFAULT_RISK_LEVEL,
    signal_type: str = DEFAULT_SIGNAL_TYPE,
    target_day: date | None = None,
    send_email: bool = False,
    user_ids: list[str] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    market = _normalize_market(market)
    risk_level = _normalize_risk(risk_level)
    signal_type = _normalize_signal_type(signal_type)
    run_day = _today_ist()
    if _is_market_holiday(run_day) and not force:
        return {"skipped": True, "reason": "Non-trading day", "run_date": run_day.isoformat()}

    existing_run = _find_existing_run(run_day.isoformat(), market, risk_level, signal_type)
    if existing_run and not force:
        signals = _load_signals_for_run(existing_run["id"])
        notifications = _send_daily_signal_emails(existing_run, signals, user_ids=user_ids) if send_email else []
        return {"model_run": existing_run, "signals": signals, "notifications": notifications, "cached": True}

    market_context = fetch_market_context(market)
    index_frame = build_feature_frame(market_context["index_history"])
    regime = detect_market_regime(market_context["index_history"])
    feature_frames: dict[str, pd.DataFrame] = {}
    skipped_no_data = 0
    for ticker in get_universe(market):
        # allow_mock=False => never build a signal on synthetic/mock prices.
        history = fetch_price_history(ticker, days=320, allow_mock=ALLOW_MOCK_SIGNAL_DATA)
        if history.empty:
            skipped_no_data += 1
            continue
        features = build_feature_frame(history)
        if not features.empty:
            feature_frames[ticker] = features
        else:
            skipped_no_data += 1

    sector_strengths = _group_sector_strength(feature_frames, market_context["index_history"])
    stats = _setup_stats()
    candidates: list[dict[str, Any]] = []
    for ticker, feature_frame in feature_frames.items():
        sector = SECTOR_BY_SYMBOL.get(ticker.replace(".NS", "").replace(".BO", ""), "General")
        candidate = _build_candidate(
            ticker=ticker,
            feature_frame=feature_frame,
            index_frame=market_context["index_history"],
            regime=regime,
            sector_strength=sector_strengths.get(sector, 0.0),
            setup_stats=stats,
            risk_level=risk_level,
            signal_type=signal_type,
        )
        if candidate:
            candidates.append(candidate)

    selected = diversify_candidates(candidates)[:MAX_SELECTED_SIGNALS]
    run_id = str(uuid4())
    generated_at = _utc_now_iso()
    target_date = (target_day or _next_trading_day(run_day)).isoformat()
    model_version = os.getenv("DAILY_SIGNAL_MODEL_VERSION", "signal-engine-v1")
    signal_rows = []
    for index, signal in enumerate(selected, 1):
        signal_rows.append(
            {
                "id": str(uuid4()),
                "model_run_id": run_id,
                "symbol": signal["symbol"],
                "company_name": signal["company_name"],
                "sector": signal["sector"],
                "direction": signal["direction"],
                "entry_low": signal["entry_low"],
                "entry_high": signal["entry_high"],
                "target_price": signal["target_price"],
                "stop_loss": signal["stop_loss"],
                "confidence": signal["confidence"],
                "expected_r": signal["expected_r"],
                "risk_reward": signal["risk_reward"],
                "final_score": signal["final_score"],
                "setup_type": signal["setup_type"],
                "explanation_json": signal["explanation_json"],
                "model_version": model_version,
                "run_date": run_day.isoformat(),
                "target_date": target_date,
                "market": market,
                "data_quality_valid": signal["data_quality_valid"],
                "signal_rank": index,
            }
        )

    run_payload = {
        "id": run_id,
        "run_date": run_day.isoformat(),
        "target_date": target_date,
        "market": market,
        "risk_level": risk_level,
        "signal_type": signal_type,
        "model_version": model_version,
        "generated_at": generated_at,
        "universe_size": len(get_universe(market)),
        "filtered_count": len(candidates),
        "selected_count": len(signal_rows),
        "data_timestamp": generated_at,
        "status": "completed",
        "summary": {
            "market_regime": regime,
            "evaluated_count": len(feature_frames),
            "skipped_no_data": skipped_no_data,
            "max_signals": MAX_SELECTED_SIGNALS,
            "method": "data ingestion, validation, feature engineering, technical rules, scoring, diversification, and outcome tracking",
        },
    }
    stored_run = _store_model_run(run_payload, signal_rows)
    _log_audit("model_run_created", "model_runs", stored_run, entity_id=run_id)
    notifications = _send_daily_signal_emails(stored_run, signal_rows, user_ids=user_ids) if send_email else []
    return {"model_run": stored_run, "signals": signal_rows, "notifications": notifications, "cached": False}


def _iter_preferences() -> list[dict[str, Any]]:
    if supabase:
        try:
            response = (
                supabase.table(PREFERENCE_TABLE)
                .select("*")
                .eq("daily_stock_email_enabled", True)
                .is_("unsubscribed_at", "null")
                .execute()
            )
            return getattr(response, "data", None) or []
        except Exception as exc:
            if not _should_use_memory_fallback(exc, PREFERENCE_TABLE):
                raise
            print(f"[DailySignals] notification preferences table missing during subscriber lookup, using in-memory fallback: {exc}")
    return [value for value in _MEMORY_PREFERENCES.values() if value.get("daily_stock_email_enabled") and not value.get("unsubscribed_at")]


def _email_already_sent(user_id: str, run_id: str) -> bool:
    if supabase:
        try:
            response = (
                supabase.table(EMAIL_LOGS_TABLE)
                .select("id")
                .eq("user_id", user_id)
                .eq("model_run_id", run_id)
                .eq("email_kind", "daily_signal")
                .limit(1)
                .execute()
            )
            return bool(getattr(response, "data", None))
        except Exception as exc:
            if not _should_use_memory_fallback(exc, EMAIL_LOGS_TABLE):
                raise
            print(f"[DailySignals] email logs table missing during duplicate check, using in-memory fallback: {exc}")
    return any(item for item in _MEMORY_EMAIL_LOGS if item["user_id"] == user_id and item["model_run_id"] == run_id and item["email_kind"] == "daily_signal")


def _log_email(record: dict[str, Any]):
    if supabase:
        try:
            supabase.table(EMAIL_LOGS_TABLE).insert(record).execute()
            return
        except Exception as exc:
            if not _should_use_memory_fallback(exc, EMAIL_LOGS_TABLE):
                raise
            print(f"[DailySignals] email logs table missing during insert, using in-memory fallback: {exc}")
    _MEMORY_EMAIL_LOGS.append(record)


def _send_signal_email_to_preference(
    model_run: dict[str, Any],
    signals: list[dict[str, Any]],
    preference: dict[str, Any],
    *,
    email_kind: str,
) -> dict[str, Any]:
    subject, text, html = build_signal_email(
        signal_date=model_run["target_date"],
        market=model_run["market"],
        signals=signals,
        unsubscribe_url=_unsubscribe_url(preference),
        risk_level=model_run["risk_level"],
        signal_type=model_run["signal_type"],
    )
    result = _send_email(preference["email"], subject, text, html=html)
    log_record = {
        "id": str(uuid4()),
        "user_id": preference["user_id"],
        "model_run_id": model_run["id"],
        "email": preference["email"],
        "email_kind": email_kind,
        "target_date": model_run["target_date"],
        "status": result.get("status"),
        "provider": result.get("provider"),
        "response": result,
        "sent_at": _utc_now_iso(),
        "error_message": result.get("error") or result.get("reason"),
    }
    _log_email(log_record)
    return {"user_id": preference["user_id"], "email": preference["email"], **result}


def _send_daily_signal_emails(model_run: dict[str, Any], signals: list[dict[str, Any]], user_ids: list[str] | None = None) -> list[dict[str, Any]]:
    notifications: list[dict[str, Any]] = []
    allowed = set(user_ids or [])
    for preference in _iter_preferences():
        if allowed and preference["user_id"] not in allowed:
            continue
        if preference.get("market") != model_run["market"] or preference.get("risk_level") != model_run["risk_level"] or preference.get("signal_type") != model_run["signal_type"]:
            continue
        if _email_already_sent(preference["user_id"], model_run["id"]):
            continue
        notifications.append(
            _send_signal_email_to_preference(
                model_run,
                signals,
                preference,
                email_kind="daily_signal",
            )
        )
    return notifications


def send_instant_signal_email(user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    current = get_notification_preference(user)
    market = _normalize_market(payload.get("market") or current.get("market"))
    risk_level = _normalize_risk(payload.get("risk_level") or current.get("risk_level"))
    signal_type = _normalize_signal_type(payload.get("signal_type") or current.get("signal_type"))
    email_time = _validate_email_time(market, payload.get("email_time") or current.get("email_time") or DEFAULT_EMAIL_TIME)
    preference = update_notification_preference(
        user,
        {
            "email": payload.get("email") or user.get("email") or current.get("email"),
            "market": market,
            "risk_level": risk_level,
            "email_time": email_time,
            "signal_type": signal_type,
            "daily_stock_email_enabled": current.get("daily_stock_email_enabled", False),
        },
    )
    result = run_daily_prediction(
        market=market,
        risk_level=risk_level,
        signal_type=signal_type,
        send_email=False,
        user_ids=[user["id"]],
        force=True,
    )
    notification = _send_signal_email_to_preference(
        result["model_run"],
        result["signals"],
        preference,
        email_kind="instant_signal",
    )
    return {
        "preference": preference,
        "model_run": result["model_run"],
        "signals": result["signals"],
        "notification": notification,
    }


def process_scheduled_daily_alerts(force: bool = False) -> dict[str, Any]:
    now = datetime.now(IST)
    if _is_market_holiday(now.date()) and not force:
        return {"sent": 0, "reason": "Non-trading day"}

    due_preferences: list[dict[str, Any]] = []
    for preference in _iter_preferences():
        if not preference.get("consent_accepted_at"):
            continue
        preferred_time = _parse_time_string(preference.get("email_time"))
        if force or (now.hour, now.minute) >= (preferred_time.hour, preferred_time.minute):
            due_preferences.append(preference)

    grouped: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    for preference in due_preferences:
        grouped[(preference["market"], preference["risk_level"], preference["signal_type"])].append(preference["user_id"])

    all_notifications: list[dict[str, Any]] = []
    for (market, risk_level, signal_type), user_ids in grouped.items():
        result = run_daily_prediction(
            market=market,
            risk_level=risk_level,
            signal_type=signal_type,
            send_email=True,
            user_ids=user_ids,
            force=force,
        )
        all_notifications.extend(result.get("notifications", []))

    return {"sent": len(all_notifications), "notifications": all_notifications}


def _load_pending_signals(target_day: str) -> list[dict[str, Any]]:
    if supabase:
        try:
            response = (
                supabase.table(SIGNALS_TABLE)
                .select("*")
                .eq("target_date", target_day)
                .execute()
            )
            all_signals = getattr(response, "data", None) or []
            outcomes = (
                supabase.table(OUTCOMES_TABLE)
                .select("stock_signal_id")
                .execute()
            )
            processed = {row["stock_signal_id"] for row in getattr(outcomes, "data", None) or []}
            return [signal for signal in all_signals if signal["id"] not in processed]
        except Exception as exc:
            if not (_should_use_memory_fallback(exc, SIGNALS_TABLE) or _should_use_memory_fallback(exc, OUTCOMES_TABLE)):
                raise
            print(f"[DailySignals] pending signal tables missing, using in-memory fallback: {exc}")
    processed = {row["stock_signal_id"] for row in _MEMORY_OUTCOMES}
    return [signal for signal in _MEMORY_SIGNALS if signal["target_date"] == target_day and signal["id"] not in processed]


def run_outcome_tracking(review_day: date | None = None) -> dict[str, Any]:
    day = review_day or _previous_trading_day(_next_trading_day(_today_ist()) if _is_market_holiday(_today_ist()) else _today_ist())
    pending = _load_pending_signals(day.isoformat())
    stored: list[dict[str, Any]] = []
    for signal in pending:
        ticker = signal["symbol"] if signal["market"] == "US" else f"{signal['symbol']}.NS"
        history = fetch_price_history(ticker, days=12)
        history["date"] = pd.to_datetime(history["date"], errors="coerce")
        day_rows = history[history["date"].dt.date == day]
        if day_rows.empty:
            continue
        bar = day_rows.iloc[-1].to_dict()
        outcome = evaluate_signal_outcome(signal, bar)
        record = {
            "id": str(uuid4()),
            "stock_signal_id": signal["id"],
            "outcome": outcome["outcome"],
            "realized_r": outcome["realized_r"],
            "evaluated_at": _utc_now_iso(),
            "hit_sequence": outcome["hit_sequence"],
            "notes": {"day": day.isoformat(), "bar": {"high": bar["high"], "low": bar["low"], "close": bar["close"]}},
        }
        if supabase:
            try:
                supabase.table(OUTCOMES_TABLE).upsert(record, on_conflict="stock_signal_id").execute()
            except Exception as exc:
                if not _should_use_memory_fallback(exc, OUTCOMES_TABLE):
                    raise
                print(f"[DailySignals] outcomes table missing during tracking, using in-memory fallback: {exc}")
                _MEMORY_OUTCOMES.append(record)
        else:
            _MEMORY_OUTCOMES.append(record)
        stored.append(record)
    return {"review_day": day.isoformat(), "processed": len(stored), "outcomes": stored}


def get_signals_today(market: str | None = None, risk_level: str | None = None, signal_type: str | None = None) -> dict[str, Any]:
    selected_market = _normalize_market(market or DEFAULT_MARKET)
    selected_risk = _normalize_risk(risk_level or DEFAULT_RISK_LEVEL)
    selected_type = _normalize_signal_type(signal_type or DEFAULT_SIGNAL_TYPE)
    existing = _find_existing_run(_today_ist().isoformat(), selected_market, selected_risk, selected_type)
    if not existing:
        result = run_daily_prediction(market=selected_market, risk_level=selected_risk, signal_type=selected_type, send_email=False, force=True)
        return {"model_run": result["model_run"], "signals": result["signals"]}
    return {"model_run": existing, "signals": _load_signals_for_run(existing["id"])}


def get_signals_history(limit: int = 20) -> dict[str, Any]:
    if supabase:
        try:
            response = supabase.table(MODEL_RUNS_TABLE).select("*").order("generated_at", desc=True).limit(limit).execute()
            runs = getattr(response, "data", None) or []
        except Exception as exc:
            if not _should_use_memory_fallback(exc, MODEL_RUNS_TABLE):
                raise
            print(f"[DailySignals] model runs table missing during history load, using in-memory fallback: {exc}")
            runs = sorted(_MEMORY_RUNS, key=lambda item: item["generated_at"], reverse=True)[:limit]
    else:
        runs = sorted(_MEMORY_RUNS, key=lambda item: item["generated_at"], reverse=True)[:limit]
    return {
        "runs": [
            {
                **run,
                "signals": _load_signals_for_run(run["id"]),
            }
            for run in runs
        ]
    }


def get_admin_status() -> dict[str, Any]:
    history = get_signals_history(limit=1)["runs"]
    latest_run = history[0] if history else None
    if supabase:
        try:
            latest_email_logs = getattr(
                supabase.table(EMAIL_LOGS_TABLE).select("*").order("sent_at", desc=True).limit(20).execute(),
                "data",
                None,
            ) or []
        except Exception as exc:
            if not _should_use_memory_fallback(exc, EMAIL_LOGS_TABLE):
                raise
            print(f"[DailySignals] email logs table missing during admin status, using in-memory fallback: {exc}")
            latest_email_logs = sorted(_MEMORY_EMAIL_LOGS, key=lambda item: item["sent_at"], reverse=True)[:20]
        try:
            latest_outcomes = getattr(
                supabase.table(OUTCOMES_TABLE).select("*").order("evaluated_at", desc=True).limit(20).execute(),
                "data",
                None,
            ) or []
        except Exception as exc:
            if not _should_use_memory_fallback(exc, OUTCOMES_TABLE):
                raise
            print(f"[DailySignals] outcomes table missing during admin status, using in-memory fallback: {exc}")
            latest_outcomes = sorted(_MEMORY_OUTCOMES, key=lambda item: item["evaluated_at"], reverse=True)[:20]
    else:
        latest_email_logs = sorted(_MEMORY_EMAIL_LOGS, key=lambda item: item["sent_at"], reverse=True)[:20]
        latest_outcomes = sorted(_MEMORY_OUTCOMES, key=lambda item: item["evaluated_at"], reverse=True)[:20]
    return {
        "latest_model_run": latest_run,
        "email_send_status": latest_email_logs,
        "signal_outcomes": latest_outcomes,
        "model_version": os.getenv("DAILY_SIGNAL_MODEL_VERSION", "signal-engine-v1"),
        "data_timestamp": latest_run.get("data_timestamp") if latest_run else None,
    }


def run_daily_forecast(send_email: bool = True) -> dict[str, Any]:
    result = run_daily_prediction(send_email=send_email)
    report = {
        "kind": "forecast",
        "report_date": result["model_run"]["run_date"],
        "target_date": result["model_run"]["target_date"],
        "market": result["model_run"]["market"],
        "picks": result["signals"],
        "qualified_count": result["model_run"]["filtered_count"],
        "disclaimer": "Signals are model-generated analysis. Returns are not guaranteed.",
    }
    return {"report": report, "notifications": result.get("notifications", [])}


def run_daily_review(send_email: bool = True) -> dict[str, Any]:
    result = run_outcome_tracking()
    report = {
        "kind": "review",
        "report_date": result["review_day"],
        "results": result["outcomes"],
        "processed": result["processed"],
        "disclaimer": "Outcomes use available daily OHLC data. Intraday sequencing can be refined with lower-timeframe feeds later.",
    }
    return {"report": report, "notifications": [] if not send_email else []}
