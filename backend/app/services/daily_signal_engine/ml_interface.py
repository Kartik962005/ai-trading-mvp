from __future__ import annotations

import math
from typing import Any


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def predict_signal_probabilities(
    technical_setup: dict[str, Any],
    regime: dict[str, Any],
    risk_level: str,
    relative_strength: float,
    quality_score: float,
) -> dict[str, float]:
    direction = technical_setup["direction"]
    regime_alignment = regime["alignment_buy"] if direction == "BUY" else regime["alignment_sell"]
    directional_strength = technical_setup["buy_score"] if direction == "BUY" else technical_setup["sell_score"]
    base_logit = (
        -0.22
        + directional_strength * 0.24
        + regime_alignment * 0.9
        + quality_score * 0.75
        + abs(relative_strength) * 0.018
    )
    if risk_level == "Conservative":
        base_logit -= 0.08
    elif risk_level == "Aggressive":
        base_logit += 0.05

    p_win = 1 / (1 + math.exp(-base_logit))
    p_win = _clamp(p_win, 0.35, 0.83)
    p_loss = _clamp(0.62 - p_win, 0.1, 0.42)
    p_neutral = max(0.05, 1 - p_win - p_loss)
    model_stability = _clamp(0.48 + quality_score * 0.42 + regime_alignment * 0.12, 0.35, 0.96)
    confidence = _clamp(0.55 * p_win + 0.25 * technical_setup["chart_setup_quality"] + 0.20 * model_stability, 0.0, 0.99)
    return {
        "calibrated_pwin": round(p_win, 6),
        "p_loss": round(p_loss, 6),
        "p_neutral": round(p_neutral, 6),
        "model_stability": round(model_stability, 6),
        "confidence": round(confidence, 6),
    }
