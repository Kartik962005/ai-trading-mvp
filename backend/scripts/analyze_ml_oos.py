"""Stress-test the ML top-N result: is the +0.038 decisive R real edge, or just
bull-market timing in a favourable sample?

Loads the saved OOS predictions (ml_oos.pkl) and slices the ML top-N selection
by regime, by year, and by direction. The key questions:
  * Does the edge survive OUTSIDE bullish regimes? If it's positive only in
    bullish, it's market timing, not stock-picking skill.
  * Is it consistent year-by-year, or driven by one lucky stretch?
  * Does ML beat a 'rule top-N on bullish days only' baseline (i.e. does the
    model add anything beyond the regime filter we already had)?

    cd backend
    python scripts/analyze_ml_oos.py
"""
from __future__ import annotations

import os
import sys

import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.services.daily_signal_engine.scoring import wilson_lower_bound_placeholder  # noqa: E402

OOS_CACHE = os.path.join(_HERE, "ml_oos.pkl")
COST = 0.05
TOP_N = 10


def summarise(rows: pd.DataFrame, label: str) -> dict:
    n = len(rows)
    if n == 0:
        return {"label": label, "trades": 0}
    net = rows["realized_r"] - COST
    wins = int((rows["outcome"] == "WIN").sum())
    losses = int((rows["outcome"] == "LOSS").sum())
    decisive = wins + losses
    dec_mask = rows["outcome"].isin(["WIN", "LOSS"])
    pos = net[net > 0].sum()
    neg = -net[net < 0].sum()
    return {
        "label": label, "trades": n,
        "dec_R": round(float(net[dec_mask].mean()), 4) if decisive else None,
        "avg_R": round(float(net.mean()), 4),
        "PF": round(float(pos / neg), 4) if neg > 0 else None,
        "wilson": round(wilson_lower_bound_placeholder(wins, decisive), 4) if decisive else None,
        "totalR": round(float(net.sum()), 1),
    }


def ptable(rows_list: list[dict]) -> None:
    hdr = f"{'slice':<30}{'trades':>7}{'dec_R':>9}{'avg_R':>9}{'PF':>8}{'wilson':>9}{'totalR':>10}"
    print(hdr)
    print("-" * len(hdr))
    for s in rows_list:
        if s.get("trades", 0) == 0:
            print(f"{s['label']:<30}{'0':>7}")
            continue
        print(f"{s['label']:<30}{s['trades']:>7}{_n(s.get('dec_R')):>9}{_n(s.get('avg_R')):>9}"
              f"{_n(s.get('PF')):>8}{_n(s.get('wilson')):>9}{_n(s.get('totalR')):>10}")


def _n(v) -> str:
    if v is None:
        return "—"
    return f"{v:.4f}" if abs(v) < 100 else f"{v:.1f}"


def top_n(df: pd.DataFrame, by: str = "p_win") -> pd.DataFrame:
    return (df.sort_values(["date", by], ascending=[True, False]).groupby("date").head(TOP_N))


def main() -> None:
    if not os.path.exists(OOS_CACHE):
        sys.exit("ml_oos.pkl not found — run train_ml.py first (it now saves OOS).")
    oos = pd.read_pickle(OOS_CACHE)
    oos["year"] = oos["date"].str[:4]
    picks = top_n(oos, "p_win")

    print("=" * 80)
    print("Q1. ML top-10 BY MARKET REGIME  (does edge survive outside bullish?)")
    print("=" * 80)
    ptable([summarise(picks, "ML top-10 OVERALL")] +
           [summarise(picks[picks["regime_label"] == r], f"  regime={r}")
            for r in sorted(picks["regime_label"].unique())])

    print("\n" + "=" * 80)
    print("Q2. ML top-10 BY YEAR  (consistent, or one lucky stretch?)")
    print("=" * 80)
    ptable([summarise(picks[picks["year"] == y], f"  {y}") for y in sorted(picks["year"].unique())])

    print("\n" + "=" * 80)
    print("Q3. ML top-10 BY DIRECTION")
    print("=" * 80)
    ptable([summarise(picks[picks["direction"] == d], f"  {d}") for d in sorted(picks["direction"].unique())])

    print("\n" + "=" * 80)
    print("Q4. DOES ML BEAT THE REGIME FILTER ALONE?")
    print("    (rule-ranked top-10, traded only on bullish days, vs ML top-10)")
    print("=" * 80)
    rule_rank = oos.assign(rule_score=oos["chart_setup_quality"] + 0.01 * oos["buy_score"])
    rule_bull = top_n(rule_rank[rule_rank["regime_label"] == "bullish"], "rule_score")
    ml_bull = picks[picks["regime_label"] == "bullish"]
    ptable([
        summarise(ml_bull, "ML top-10 (bullish days)"),
        summarise(rule_bull, "RULE top-10 (bullish days)"),
        summarise(picks, "ML top-10 (all days)"),
    ])

    print("\n" + "=" * 80)
    print("Q5. SHARE OF ML PICKS THAT FALL ON BULLISH DAYS")
    print("=" * 80)
    share = (picks["regime_label"] == "bullish").mean()
    base_share = (oos["regime_label"] == "bullish").mean()
    print(f"  bullish share of ML picks   = {share:.3f}")
    print(f"  bullish share of all signals = {base_share:.3f}")
    print("  -> if ML picks are much more bull-concentrated than the universe,")
    print("     the 'edge' is largely market timing, not stock selection.")

    print("\nINTERPRETATION GUIDE:")
    print("  * Real stock-picking edge  -> positive dec_R in MULTIPLE regimes & years,")
    print("    and ML clearly beats RULE-on-bullish-days.")
    print("  * Disguised market timing  -> positive only in bullish/up-years, and")
    print("    barely beats the regime filter. Still usable, but must be SOLD as a")
    print("    regime-timed tool, never as a per-stock oracle.")


if __name__ == "__main__":
    main()
