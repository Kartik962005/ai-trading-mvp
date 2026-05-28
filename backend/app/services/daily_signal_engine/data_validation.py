from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd

from .config import MIN_HISTORY_DAYS, RISK_PROFILES


def validate_candidate_frame(frame: pd.DataFrame, risk_level: str) -> dict[str, Any]:
    rejections: list[str] = []
    if frame is None or frame.empty:
        return {"is_valid": False, "rejections": ["missing data"], "quality_score": 0.0}
    if len(frame) < MIN_HISTORY_DAYS:
        rejections.append("insufficient trading history")

    latest_date = pd.to_datetime(frame["date"].iloc[-1], errors="coerce")
    if pd.isna(latest_date):
        rejections.append("missing data")
    else:
        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=4)
        if latest_date.to_pydatetime().replace(tzinfo=timezone.utc) < stale_cutoff:
            rejections.append("stale data")

    work = frame.tail(60).copy()
    missing_ratio = float(work[["open", "high", "low", "close"]].isna().mean().mean())
    if missing_ratio > 0.0:
        rejections.append("missing data")

    work["turnover"] = work["close"] * work["volume"]
    avg_turnover = float(work["turnover"].tail(20).mean() or 0.0)
    if avg_turnover < 150_000_000:
        rejections.append("low liquidity")

    work["spread_proxy"] = ((work["high"] - work["low"]) / work["close"]).replace([float("inf"), float("-inf")], 0.0)
    spread_proxy = float(work["spread_proxy"].tail(10).mean() or 0.0)
    if spread_proxy > 0.055:
        rejections.append("high spread")

    work["daily_return"] = work["close"].pct_change()
    volatility = float(work["daily_return"].tail(20).std() or 0.0)
    max_atr_pct = RISK_PROFILES.get(risk_level, RISK_PROFILES["Balanced"])["max_atr_pct"] / 100
    if volatility <= 0:
        rejections.append("missing data")
    elif volatility > max_atr_pct:
        rejections.append("abnormal volatility")

    if abs(float(work["daily_return"].tail(1).iloc[0] or 0.0)) > 0.16:
        rejections.append("corporate action or earnings event risk")

    unique_rejections = list(dict.fromkeys(rejections))
    quality_score = max(0.0, 1.0 - 0.18 * len(unique_rejections) - missing_ratio)
    return {
        "is_valid": len(unique_rejections) == 0,
        "rejections": unique_rejections,
        "quality_score": round(quality_score, 4),
        "avg_turnover": avg_turnover,
        "spread_proxy": spread_proxy,
        "volatility": volatility,
    }
