from __future__ import annotations

from collections import defaultdict
from typing import Any

import pandas as pd

from .config import CORRELATION_LOOKBACK, CORRELATION_THRESHOLD, MAX_SELECTED_SIGNALS, MAX_SIGNALS_PER_SECTOR


def _is_highly_correlated(candidate: dict[str, Any], selected: list[dict[str, Any]]) -> bool:
    candidate_returns = candidate.get("recent_returns") or []
    if len(candidate_returns) < 10:
        return False
    candidate_series = pd.Series(candidate_returns[-CORRELATION_LOOKBACK:])
    for item in selected:
        existing_returns = item.get("recent_returns") or []
        if len(existing_returns) < 10:
            continue
        existing_series = pd.Series(existing_returns[-CORRELATION_LOOKBACK:])
        corr = candidate_series.corr(existing_series)
        if pd.notna(corr) and corr >= CORRELATION_THRESHOLD:
            return True
    return False


def diversify_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    sector_counts: dict[str, int] = defaultdict(int)
    # Sort by the risk-aware rank score when present (so Conservative/Balanced/
    # Aggressive produce different shortlists), falling back to the raw score.
    for candidate in sorted(
        candidates,
        key=lambda item: item.get("rank_score", item["final_score"]),
        reverse=True,
    ):
        sector = candidate.get("sector") or "General"
        if sector_counts[sector] >= MAX_SIGNALS_PER_SECTOR:
            continue
        if _is_highly_correlated(candidate, selected):
            continue
        selected.append(candidate)
        sector_counts[sector] += 1
        if len(selected) >= MAX_SELECTED_SIGNALS:
            break
    return selected
