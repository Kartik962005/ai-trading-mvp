from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.supabase_client import supabase
from app.services.strategy_engine import DISCLAIMER, StrategySpec, backtest_strategy, strategy_to_dict

STRATEGY_TABLE = "user_strategies"
SIGNAL_TABLE = "strategy_signals"
MAX_STRATEGIES_PER_USER = 10


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _supabase_required():
    if supabase is None:
        raise ValueError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return supabase


def _friendly_table_error(exc: Exception) -> ValueError:
    text = str(exc)
    if "user_strategies" in text or "strategy_signals" in text or "schema cache" in text or "does not exist" in text:
        return ValueError("AI Strategy Alerts are not set up yet. Ask the owner to run backend/supabase_strategy_alerts.sql in Supabase.")
    return ValueError(text)


def list_strategies(user_id: str) -> list[dict[str, Any]]:
    sb = _supabase_required()
    try:
        response = (
            sb.table(STRATEGY_TABLE)
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        rows = getattr(response, "data", None) or []
    except Exception as exc:
        raise _friendly_table_error(exc) from exc
    for row in rows:
        row["disclaimer"] = DISCLAIMER
    return rows


def create_strategy(
    user: dict[str, Any],
    *,
    name: str | None,
    nl_text: str,
    strategy_json: dict[str, Any],
    quality: dict[str, Any] | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    sb = _supabase_required()
    existing = list_strategies(user["id"])
    if len(existing) >= MAX_STRATEGIES_PER_USER:
        raise ValueError(f"You can save up to {MAX_STRATEGIES_PER_USER} AI strategies.")
    clean_strategy = strategy_to_dict(strategy_json)
    quality = quality or backtest_strategy(clean_strategy).get("quality") or {}
    payload = {
        "id": str(uuid4()),
        "user_id": user["id"],
        "name": (name or nl_text[:80] or "AI Strategy").strip(),
        "nl_text": nl_text.strip(),
        "strategy_json": clean_strategy,
        "quality": {**quality, "disclaimer": DISCLAIMER},
        "enabled": bool(enabled),
        "created_at": _utc_now_iso(),
        "updated_at": _utc_now_iso(),
        "last_run_date": None,
    }
    try:
        response = sb.table(STRATEGY_TABLE).insert(payload).execute()
        rows = getattr(response, "data", None) or []
        saved = rows[0] if rows else payload
    except Exception as exc:
        raise _friendly_table_error(exc) from exc
    saved["disclaimer"] = DISCLAIMER
    return saved


def update_strategy(user_id: str, strategy_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    updates: dict[str, Any] = {"updated_at": _utc_now_iso()}
    if "enabled" in patch:
        updates["enabled"] = bool(patch["enabled"])
    if "name" in patch and str(patch["name"]).strip():
        updates["name"] = str(patch["name"]).strip()[:120]
    if len(updates) == 1:
        raise ValueError("No supported strategy update was supplied.")
    sb = _supabase_required()
    try:
        response = (
            sb.table(STRATEGY_TABLE)
            .update(updates)
            .eq("id", strategy_id)
            .eq("user_id", user_id)
            .execute()
        )
        rows = getattr(response, "data", None) or []
    except Exception as exc:
        raise _friendly_table_error(exc) from exc
    if not rows:
        raise ValueError("Strategy not found.")
    rows[0]["disclaimer"] = DISCLAIMER
    return rows[0]


def delete_strategy(user_id: str, strategy_id: str) -> dict[str, Any]:
    sb = _supabase_required()
    try:
        response = sb.table(STRATEGY_TABLE).delete().eq("id", strategy_id).eq("user_id", user_id).execute()
    except Exception as exc:
        raise _friendly_table_error(exc) from exc
    rows = getattr(response, "data", None) or []
    return {"deleted": bool(rows), "id": strategy_id}


def list_signals(user_id: str, strategy_id: str, limit: int = 100) -> list[dict[str, Any]]:
    sb = _supabase_required()
    try:
        response = (
            sb.table(SIGNAL_TABLE)
            .select("*")
            .eq("user_id", user_id)
            .eq("strategy_id", strategy_id)
            .order("signal_date", desc=True)
            .limit(max(1, min(limit, 500)))
            .execute()
        )
    except Exception as exc:
        raise _friendly_table_error(exc) from exc
    return getattr(response, "data", None) or []


def validate_strategy_json(payload: dict[str, Any]) -> dict[str, Any]:
    return StrategySpec.model_validate(payload).model_dump()
