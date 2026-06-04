from __future__ import annotations

from typing import Any


def evaluate_technical_setup(latest: dict[str, Any], relative_strength: float, sector_strength: float) -> dict[str, Any]:
    close = float(latest["close"])
    ema20 = float(latest["ema20"])
    ema50 = float(latest["ema50"])
    resistance20 = float(latest["resistance20"])
    support20 = float(latest["support20"])
    volume_ratio = float(latest["volume"] / latest["vol_avg20"]) if float(latest["vol_avg20"]) else 0.0
    rsi = float(latest["rsi14"])
    adx = float(latest["adx14"])

    buy_score = 0
    sell_score = 0
    buy_reasons: list[str] = []
    sell_reasons: list[str] = []

    if close > ema20:
        buy_score += 1
        buy_reasons.append("close above EMA 20")
    if ema20 > ema50:
        buy_score += 1
        buy_reasons.append("EMA 20 above EMA 50")
    if close > resistance20:
        buy_score += 1
        buy_reasons.append("breakout above resistance")
    if volume_ratio > 1.5:
        buy_score += 1
        buy_reasons.append(f"volume {volume_ratio:.2f}x 20-day average")
    if 45 <= rsi <= 70:
        buy_score += 1
        buy_reasons.append(f"RSI {rsi:.1f} in bullish range")
    if adx > 18:
        buy_score += 1
        buy_reasons.append(f"ADX {adx:.1f} confirms trend")
    if relative_strength > 0:
        buy_score += 1
        buy_reasons.append(f"relative strength {relative_strength:.2f}% vs index")
    if sector_strength > 0:
        buy_score += 1
        buy_reasons.append("sector strength positive")

    if close < ema20:
        sell_score += 1
        sell_reasons.append("close below EMA 20")
    if ema20 < ema50:
        sell_score += 1
        sell_reasons.append("EMA 20 below EMA 50")
    if close < support20:
        sell_score += 1
        sell_reasons.append("breakdown below support")
    if volume_ratio > 1.5:
        sell_score += 1
        sell_reasons.append(f"volume {volume_ratio:.2f}x 20-day average")
    if 30 <= rsi <= 55:
        sell_score += 1
        sell_reasons.append(f"RSI {rsi:.1f} in weak range")
    if adx > 18:
        sell_score += 1
        sell_reasons.append(f"ADX {adx:.1f} confirms trend")
    if relative_strength < 0:
        sell_score += 1
        sell_reasons.append(f"relative weakness {relative_strength:.2f}% vs index")
    if sector_strength < 0:
        sell_score += 1
        sell_reasons.append("sector weakness")

    edge = buy_score - sell_score
    if edge >= 2:
        direction = "BUY"
        chosen_reasons = buy_reasons
        chosen_score = buy_score
    elif edge <= -2:
        direction = "SELL"
        chosen_reasons = sell_reasons
        chosen_score = sell_score
    else:
        direction = "HOLD"
        chosen_reasons = ["mixed setup; no clear directional edge"]
        chosen_score = max(buy_score, sell_score)

    edge_quality = min(1.0, abs(edge) / 4)
    chart_setup_quality = min(1.0, (chosen_score / 8) * (0.72 + 0.28 * edge_quality))

    return {
        "direction": direction,
        "buy_score": buy_score,
        "sell_score": sell_score,
        "directional_edge": edge,
        "chart_setup_quality": round(chart_setup_quality, 4),
        "setup_type": (
            "no_trade"
            if direction == "HOLD"
            else "trend_breakout" if chosen_score >= 6 else "momentum_continuation" if chosen_score >= 4 else "mixed_setup"
        ),
        "reasons": chosen_reasons[:5],
        "volume_ratio": round(volume_ratio, 4),
        "rsi": round(rsi, 2),
        "adx": round(adx, 2),
    }
