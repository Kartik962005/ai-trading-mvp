from __future__ import annotations

from typing import Any


def evaluate_signal_outcome(signal: dict[str, Any], trading_day_bar: dict[str, Any]) -> dict[str, Any]:
    target = float(signal["target_price"])
    stop = float(signal["stop_loss"])
    entry = float(signal["entry_high"] if signal["direction"] == "SELL" else signal["entry_low"])
    high = float(trading_day_bar["high"])
    low = float(trading_day_bar["low"])
    close = float(trading_day_bar["close"])

    if signal["direction"] == "BUY":
        target_hit = high >= target
        stop_hit = low <= stop
        close_r = (close - entry) / max(entry - stop, 1e-6)
    else:
        target_hit = low <= target
        stop_hit = high >= stop
        close_r = (entry - close) / max(stop - entry, 1e-6)

    if target_hit and stop_hit:
        return {"outcome": "NEUTRAL", "realized_r": round(close_r, 4), "hit_sequence": "ambiguous_same_day"}
    if target_hit:
        return {"outcome": "WIN", "realized_r": round(signal["risk_reward"], 4), "hit_sequence": "target_first"}
    if stop_hit:
        return {"outcome": "LOSS", "realized_r": -1.0, "hit_sequence": "stop_first"}
    return {"outcome": "NEUTRAL", "realized_r": round(close_r, 4), "hit_sequence": "neither_hit"}
