"""Cheap in-sample experiments: do simple gates/thresholds rescue the rules?

Loads the cached history ONCE, then runs the hardened walk-forward backtest
across a grid of configurations (regime gate, direction gate, R/R multiples,
confidence threshold) and ranks them by the HONEST metric: decisive-only
net R per trade (expectancy on trades that actually hit a barrier).

    cd backend
    python scripts/run_backtest_sweep.py

>>> READ THIS BEFORE BELIEVING ANY ROW <<<
This is in-sample optimisation on ~1 year of data. The "best" config here is
almost certainly partly luck. A config only earns trust if (a) it makes
economic sense, (b) it holds up out-of-sample / on more data, and (c) it isn't
relying on a tiny trade count. Treat winners as HYPOTHESES, not conclusions.
"""
from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.services.daily_signal_engine.backtest import run_backtest  # noqa: E402
from run_backtest import _connect, load_frames  # noqa: E402

# Each experiment: (label, kwargs passed to run_backtest)
EXPERIMENTS: list[tuple[str, dict]] = [
    ("baseline (all)", {}),
    ("bullish-regime only", {"allowed_regimes": {"bullish"}}),
    ("bullish+neutral regime", {"allowed_regimes": {"bullish", "neutral"}}),
    ("BUY only", {"allowed_directions": {"BUY"}}),
    ("SELL only", {"allowed_directions": {"SELL"}}),
    ("BUY + bullish only", {"allowed_directions": {"BUY"}, "allowed_regimes": {"bullish"}}),
    ("wider target (RR~2.0)", {"target_mult": 1.44, "stop_mult": 0.72}),
    ("tighter stop (RR~1.9)", {"target_mult": 1.0, "stop_mult": 0.52}),
    ("higher conf gate 0.80", {"conf_threshold": 0.80}),
    ("higher RR gate 1.6", {"min_rr": 1.6}),
    ("BUY+bullish+RR2.0", {"allowed_directions": {"BUY"}, "allowed_regimes": {"bullish"},
                            "target_mult": 1.44, "stop_mult": 0.72}),
]

BREAKEVEN_NOTE = (
    "Break-even decisive R is ~0 by construction (R is net of costs). "
    "A row only beats the baseline if decisive_R is clearly > the baseline's "
    "AND trade count stays meaningful."
)


def main() -> None:
    sb = _connect()
    print("Loading history once ...")
    price_frames, index_frame, missing, index_symbol = load_frames(sb, "NSE")
    if index_frame.empty or not price_frames:
        sys.exit("Missing index or symbol history — cache data first.")
    print(f"Loaded {len(price_frames)} symbols, index {index_symbol} "
          f"({len(index_frame)} bars). Running {len(EXPERIMENTS)} experiments "
          "(hold_days=5, ambiguous=loss)...\n")

    rows = []
    for label, kwargs in EXPERIMENTS:
        rep = run_backtest(price_frames, index_frame, hold_days=5, ambiguous_as="loss", **kwargs)
        o = rep["overall"]
        rows.append({
            "label": label,
            "trades": o.get("trades", 0),
            "decisive_R": o.get("decisive_avg_net_r"),
            "avg_R": o.get("avg_net_r_per_trade"),
            "PF": o.get("profit_factor"),
            "raw_win": o.get("raw_win_rate_decisive"),
            "wilson": o.get("wilson_lb_win_rate"),
            "total_R": o.get("total_net_r"),
        })

    # Rank by decisive R (the honest edge metric); Nones sink to the bottom.
    rows.sort(key=lambda r: (r["decisive_R"] is not None, r["decisive_R"] or -9), reverse=True)

    print("=" * 100)
    print(f"{'config':<26}{'trades':>7}{'decisive_R':>12}{'avg_R':>9}"
          f"{'PF':>7}{'raw_win':>9}{'wilson':>9}{'total_R':>10}")
    print("-" * 100)
    for r in rows:
        print(f"{r['label']:<26}{r['trades']:>7}"
              f"{_n(r['decisive_R']):>12}{_n(r['avg_R']):>9}{_n(r['PF']):>7}"
              f"{_n(r['raw_win']):>9}{_n(r['wilson']):>9}{_n(r['total_R']):>10}")
    print("=" * 100)
    print("\nRanked by decisive_R (expectancy on trades that actually resolved).")
    print(BREAKEVEN_NOTE)
    print(
        "\nWARNING: in-sample optimisation on ~1 year. The top row is a HYPOTHESIS, "
        "not a validated strategy. Confirm on more/out-of-sample data before "
        "trusting it, and discount any row with few trades.\n"
    )


def _n(v) -> str:
    return "—" if v is None else f"{v:.4f}" if abs(v) < 100 else f"{v:.1f}"


if __name__ == "__main__":
    main()
