from __future__ import annotations

from typing import Any

import pandas as pd
import ta


def detect_market_regime(index_history: pd.DataFrame) -> dict[str, Any]:
    if index_history is None or index_history.empty or len(index_history) < 60:
        return {
            "label": "neutral",
            "alignment_buy": 0.5,
            "alignment_sell": 0.5,
            "score": 0.5,
        }

    work = index_history.copy()
    close = work["close"]
    high = work["high"]
    low = work["low"]
    work["ema20"] = ta.trend.ema_indicator(close, window=20)
    work["ema50"] = ta.trend.ema_indicator(close, window=50)
    work["adx14"] = ta.trend.adx(high, low, close, window=14)
    latest = work.dropna().iloc[-1]

    bullish = latest["close"] > latest["ema20"] > latest["ema50"]
    bearish = latest["close"] < latest["ema20"] < latest["ema50"]
    adx = float(latest["adx14"])
    trend_strength = min(1.0, max(0.0, (adx - 12) / 20))

    if bullish:
        return {
            "label": "bullish",
            "alignment_buy": round(0.65 + 0.35 * trend_strength, 4),
            "alignment_sell": round(0.45 - 0.25 * trend_strength, 4),
            "score": round(0.6 + 0.4 * trend_strength, 4),
        }
    if bearish:
        return {
            "label": "bearish",
            "alignment_buy": round(0.45 - 0.25 * trend_strength, 4),
            "alignment_sell": round(0.65 + 0.35 * trend_strength, 4),
            "score": round(0.6 + 0.4 * trend_strength, 4),
        }
    return {
        "label": "neutral",
        "alignment_buy": 0.55,
        "alignment_sell": 0.55,
        "score": 0.55,
    }
