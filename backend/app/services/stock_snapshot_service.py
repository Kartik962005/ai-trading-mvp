from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from app.core.supabase_client import supabase
except Exception:
    supabase = None


SNAPSHOT_TABLE = "stock_snapshot"
SNAPSHOT_STALE_HOURS = float(os.getenv("STOCK_SNAPSHOT_STALE_HOURS", "18"))
_cache: dict[str, Any] = {"ts": 0.0, "rows": []}
_CACHE_TTL = 300


def _clean_number(value: Any) -> float | None:
    try:
        if value is None or pd.isna(value):
            return None
        return round(float(value), 4)
    except Exception:
        return None


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _symbol_from_ticker(ticker: str) -> str:
    return str(ticker).replace(".NS", "").replace(".BO", "").upper()


def _stock_from_snapshot(row: dict[str, Any], fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    fallback = fallback or {}
    ticker = row.get("ticker") or fallback.get("ticker")
    symbol = row.get("symbol") or fallback.get("symbol") or _symbol_from_ticker(str(ticker or ""))
    return {
        "name": row.get("name") or fallback.get("name") or symbol,
        "symbol": symbol,
        "exchange": fallback.get("exchange") or ("NSE" if str(ticker or "").endswith(".NS") else fallback.get("exchange", "NSE")),
        "ticker": ticker,
        "currency": fallback.get("currency") or "₹",
    }


def frontend_metric_row(
    row: dict[str, Any],
    fallback_stock: dict[str, Any] | None = None,
    *,
    reason: str | None = None,
    score: int | None = None,
) -> dict[str, Any]:
    market_cap_cr = _num(row.get("market_cap_cr"))
    market_cap = _num(row.get("market_cap"))
    cmp_value = _num(row.get("price"))
    pe = _num(row.get("trailing_pe"))
    roe = _num(row.get("roe"))
    roce = _num(row.get("roce"))
    ret_1m = _num(row.get("ret_1m")) or 0
    vol_ratio = _num(row.get("vol_ratio")) or 0
    computed_score = 60 + min(15, int(max(ret_1m, 0))) + min(15, int(max(vol_ratio, 0) * 5))
    if pe is not None and pe > 0:
        computed_score += max(0, min(8, int(30 - pe)))
    if roe is not None:
        computed_score += max(0, min(8, int(roe / 4)))
    latest_date = str(row.get("latest_date") or row.get("updated_at") or "")[:10] or None
    row_reason = reason or (
        f"Snapshot match: close {cmp_value:.2f} on {latest_date}; "
        f"P/E {pe:.2f}; ROE {roe:.2f}%; 1M return {ret_1m:.2f}%."
        if cmp_value is not None and pe is not None and roe is not None
        else "Snapshot match from precomputed Bullseye market data."
    )
    return {
        "stock": _stock_from_snapshot(row, fallback_stock),
        "cmp": cmp_value,
        "pe": pe,
        "marketCapCr": market_cap_cr,
        "marketCapitalization": market_cap,
        "divYield": _num(row.get("dividend_yield")),
        "avgDividendPayout3Yr": None,
        "qtrSalesCr": None,
        "qtrProfitVar": _num(row.get("earnings_quarterly_growth")),
        "qtrSalesVar": None,
        "revenueGrowth3Yr": _num(row.get("revenue_growth")),
        "profitGrowth3Yr": _num(row.get("profit_growth")),
        "profitGrowth5Yr": _num(row.get("profit_growth")),
        "roe": roe,
        "roce": roce,
        "avgRoce7Yr": roce,
        "debtToEquity": _num(row.get("debt_to_equity")),
        "operatingMargin": _num(row.get("operating_margin")),
        "piotroskiScore": None,
        "avgPat10Yrs": None,
        "score": max(50, min(int(score if score is not None else computed_score), 99)),
        "reason": row_reason,
        "technical": {
            "latestDate": latest_date,
            "gainStreakDays": None,
            "recentVolumeAvg": None,
            "previousWeekVolumeAvg": None,
            "volumeRatioVsPreviousWeek": _num(row.get("vol_ratio")),
            "recentReturnPct": _num(row.get("ret_1w")),
            "return1wPct": _num(row.get("ret_1w")),
            "return1mPct": _num(row.get("ret_1m")),
            "return3mPct": _num(row.get("ret_3m")),
            "return6mPct": _num(row.get("ret_6m")),
            "return1yPct": _num(row.get("ret_1y")),
            "todayReturnPct": _num(row.get("change_pct")),
            "gapPct": None,
            "rsi14": _num(row.get("rsi14")),
            "mfi14": _num(row.get("mfi14")),
            "sma20": _num(row.get("sma20")),
            "sma50": _num(row.get("sma50")),
            "sma200": _num(row.get("sma200")),
            "ema20": _num(row.get("ema20")),
            "atr14": _num(row.get("atr14")),
            "atrChange5d": None,
            "latestVolume": _num(row.get("latest_volume")),
            "volumeSma10": None,
            "volumeSma20": _num(row.get("volume_sma20")),
            "volumeRatio10": None,
            "volumeRatio20": _num(row.get("vol_ratio")),
            "high52Week": _num(row.get("high_52w")),
            "low52Week": _num(row.get("low_52w")),
            "priceVs52WeekHighPct": (
                round(((cmp_value - _num(row.get("high_52w"))) / _num(row.get("high_52w"))) * 100, 4)
                if cmp_value is not None and _num(row.get("high_52w")) else None
            ),
            "priceVs52WeekLowPct": (
                round(((cmp_value - _num(row.get("low_52w"))) / _num(row.get("low_52w"))) * 100, 4)
                if cmp_value is not None and _num(row.get("low_52w")) else None
            ),
            "higherHighsLows10d": None,
            "lowerHighsLows10d": None,
            "requestedMetrics": [],
        },
    }


def snapshot_available() -> bool:
    return supabase is not None


def get_snapshot_rows(
    tickers: list[str] | None = None,
    *,
    max_age_hours: float | None = SNAPSHOT_STALE_HOURS,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    if supabase is None:
        return []
    now = time.time()
    if tickers is None and not force_refresh and now - float(_cache.get("ts") or 0) < _CACHE_TTL:
        rows = list(_cache.get("rows") or [])
    else:
        try:
            if tickers:
                rows: list[dict[str, Any]] = []
                clean = [ticker for ticker in tickers if ticker]
                for index in range(0, len(clean), 100):
                    response = supabase.table(SNAPSHOT_TABLE).select("*").in_("ticker", clean[index:index + 100]).execute()
                    rows.extend(getattr(response, "data", None) or [])
            else:
                rows = []
                start = 0
                page_size = 1000
                while True:
                    response = supabase.table(SNAPSHOT_TABLE).select("*").range(start, start + page_size - 1).execute()
                    page = getattr(response, "data", None) or []
                    rows.extend(page)
                    if len(page) < page_size:
                        break
                    start += page_size
                _cache["rows"] = rows
                _cache["ts"] = now
        except Exception as exc:
            print(f"[Snapshot] stock_snapshot read failed: {exc}")
            return []
    if max_age_hours is None:
        return rows
    cutoff = datetime.now(timezone.utc).timestamp() - (max_age_hours * 3600)
    fresh_rows = []
    for row in rows:
        updated = str(row.get("updated_at") or "")
        try:
            ts = datetime.fromisoformat(updated.replace("Z", "+00:00")).timestamp()
        except Exception:
            ts = 0
        if ts >= cutoff:
            fresh_rows.append(row)
    return fresh_rows


def snapshot_by_ticker(tickers: list[str] | None = None, *, max_age_hours: float | None = SNAPSHOT_STALE_HOURS) -> dict[str, dict[str, Any]]:
    return {str(row.get("ticker")): row for row in get_snapshot_rows(tickers, max_age_hours=max_age_hours)}


def is_snapshot_stale(max_age_hours: float = SNAPSHOT_STALE_HOURS) -> bool:
    if supabase is None:
        return True
    try:
        response = supabase.table(SNAPSHOT_TABLE).select("updated_at").order("updated_at", desc=True).limit(1).execute()
        rows = getattr(response, "data", None) or []
        if not rows:
            return True
        latest = datetime.fromisoformat(str(rows[0]["updated_at"]).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - latest).total_seconds() > max_age_hours * 3600
    except Exception as exc:
        print(f"[Snapshot] Staleness check failed: {exc}")
        return True


def upsert_snapshot_rows(rows: list[dict[str, Any]], chunk_size: int = 100) -> int:
    if supabase is None:
        raise RuntimeError("Supabase is not configured.")
    if not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required to write stock_snapshot.")
    written = 0
    for index in range(0, len(rows), chunk_size):
        chunk = rows[index:index + chunk_size]
        supabase.table(SNAPSHOT_TABLE).upsert(chunk, on_conflict="ticker").execute()
        written += len(chunk)
    _cache["ts"] = 0.0
    return written


def load_frontend_stock_universe(repo_root: Path | None = None, exchange: str = "NSE") -> list[dict[str, Any]]:
    root = repo_root or Path(__file__).resolve().parents[3]
    stocks_file = root / "frontend" / "app" / "stocks.ts"
    text = stocks_file.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\{\s*name:\s*'(?P<name>(?:\\'|[^'])*)',\s*symbol:\s*'(?P<symbol>(?:\\'|[^'])*)',\s*"
        r"exchange:\s*'(?P<exchange>[^']+)',\s*ticker:\s*'(?P<ticker>[^']+)',\s*currency:\s*'(?P<currency>[^']*)'",
        re.MULTILINE,
    )
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for match in pattern.finditer(text):
        stock = {key: value.replace("\\'", "'") for key, value in match.groupdict().items()}
        if stock["exchange"] != exchange:
            continue
        if stock["ticker"] in seen:
            continue
        seen.add(stock["ticker"])
        rows.append(stock)
    return rows
