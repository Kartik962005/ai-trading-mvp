from __future__ import annotations

import math


def adjusted_win_rate(wins: int, trades: int, universe_average_win_rate: float, k: int = 20) -> float:
    return (wins + k * universe_average_win_rate) / max(1, trades + k)


def wilson_lower_bound_placeholder(wins: int, trades: int, z: float = 1.96) -> float:
    if trades <= 0:
        return 0.0
    phat = wins / trades
    denominator = 1 + z**2 / trades
    numerator = phat + z**2 / (2 * trades) - z * math.sqrt((phat * (1 - phat) + z**2 / (4 * trades)) / trades)
    return numerator / denominator


def compute_expected_r(
    p_win: float,
    p_loss: float,
    target_r: float,
    stop_r: float,
    transaction_cost_r: float = 0.03,
    slippage_r: float = 0.02,
) -> float:
    return p_win * target_r - p_loss * stop_r - transaction_cost_r - slippage_r


def compute_final_score(
    calibrated_pwin: float,
    expected_r: float,
    adjusted_setup_win_rate: float,
    market_regime_alignment: float,
    chart_setup_quality: float,
    relative_strength: float,
    liquidity_score: float,
    model_stability: float,
    risk_penalties: float,
) -> float:
    return (
        0.30 * calibrated_pwin
        + 0.20 * expected_r
        + 0.15 * adjusted_setup_win_rate
        + 0.10 * market_regime_alignment
        + 0.10 * chart_setup_quality
        + 0.05 * relative_strength
        + 0.05 * liquidity_score
        + 0.05 * model_stability
        - risk_penalties
    )
