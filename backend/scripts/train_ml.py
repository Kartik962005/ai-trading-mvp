"""Walk-forward train + calibrate a win-probability model, then test if it adds
edge over the rule baseline (decisive R = -0.037 on the 5y/80-symbol backtest).

Pipeline
--------
1. Load 5y history for the full Nifty-500 universe + ^NSEI (cached to disk).
2. Build the leakage-safe labelled dataset (cached to disk).
3. Walk forward in time: repeatedly train on all data strictly before a cutoff
   (with a `hold_days` embargo so labels don't overlap the test window),
   calibrate on the tail of the train slice, and predict the next window
   OUT-OF-SAMPLE. Concatenate OOS predictions.
4. Classification quality: ROC-AUC + Brier + a calibration reliability table.
5. Economic test: rank each day's signals by calibrated P(win), take the top-N,
   grade with the SAME stored realised R as the backtest, and compare decisive
   expectancy against the baseline. We only "win" if decisive R is clearly > 0
   AND clearly beats the rule baseline.

Honesty guardrails:
  * Everything is time-ordered; no future row ever trains a past prediction.
  * Calibration uses a held-out tail, not random CV, to respect time order.
  * We report Wilson lower bounds and decisive-only R, never raw win rate alone.

    cd backend
    python scripts/train_ml.py
    python scripts/train_ml.py --rebuild     # force rebuild caches
    python scripts/train_ml.py --top-n 10 --cost 0.05
"""
from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np
import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from sklearn.calibration import CalibratedClassifierCV  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier  # noqa: E402
from sklearn.metrics import brier_score_loss, roc_auc_score  # noqa: E402

from app.services.daily_signal_engine.ml_dataset import (  # noqa: E402
    FEATURE_COLUMNS,
    build_labeled_dataset,
)
from app.services.daily_signal_engine.scoring import wilson_lower_bound_placeholder  # noqa: E402
from fetch_earnings import EARNINGS_CACHE, fetch_earnings_dates  # noqa: E402
from ingest_history import fetch_nifty500_symbols  # noqa: E402
from run_backtest import _connect, load_frames  # noqa: E402

try:  # modern sklearn (>=1.6) way to freeze a fitted estimator for calibration
    from sklearn.frozen import FrozenEstimator
    _HAS_FROZEN = True
except Exception:
    _HAS_FROZEN = False

FRAMES_CACHE = os.path.join(_HERE, "frames_5y.pkl")
DATASET_CACHE = os.path.join(_HERE, "ml_dataset.pkl")
OOS_CACHE = os.path.join(_HERE, "ml_oos.pkl")


def get_frames(rebuild: bool):
    if not rebuild and os.path.exists(FRAMES_CACHE):
        print(f"Loading cached frames from {os.path.basename(FRAMES_CACHE)} ...")
        obj = pd.read_pickle(FRAMES_CACHE)
        return obj["price_frames"], obj["index_frame"]
    sb = _connect()
    symbols = sorted(set(fetch_nifty500_symbols()))
    print(f"Loading {len(symbols)} symbols (5y) from Supabase — this paginates, "
          "give it a minute ...")
    price_frames, index_frame, missing, idx = load_frames(sb, "NSE", symbols=symbols, min_bars=250)
    print(f"Loaded {len(price_frames)} usable symbols ({len(missing)} dropped); "
          f"index {idx} {len(index_frame)} bars.")
    pd.to_pickle({"price_frames": price_frames, "index_frame": index_frame}, FRAMES_CACHE)
    return price_frames, index_frame


def get_earnings(price_frames: dict) -> dict[str, list[str]]:
    """Load cached earnings calendar; fetch+cache if missing (slow, one-time)."""
    if os.path.exists(EARNINGS_CACHE):
        print(f"Loading cached earnings calendar from {os.path.basename(EARNINGS_CACHE)} ...")
        return pd.read_pickle(EARNINGS_CACHE)
    symbols = sorted(price_frames.keys())
    print(f"No earnings cache — fetching dates for {len(symbols)} symbols via yfinance "
          "(one-time, ~a few minutes) ...")
    data = fetch_earnings_dates(symbols, delay=0.3)
    pd.to_pickle(data, EARNINGS_CACHE)
    return data


def get_dataset(rebuild_dataset: bool, rebuild_frames: bool, hold_days: int) -> pd.DataFrame:
    if not rebuild_dataset and os.path.exists(DATASET_CACHE):
        print(f"Loading cached dataset from {os.path.basename(DATASET_CACHE)} ...")
        return pd.read_pickle(DATASET_CACHE)
    # Reuse cached frames unless a full --rebuild was requested.
    price_frames, index_frame = get_frames(rebuild_frames)
    earnings = get_earnings(price_frames)
    have = sum(1 for v in earnings.values() if v)
    print(f"Earnings calendar: {have}/{len(earnings)} symbols have dates.")
    print("Building labelled dataset (leakage-safe) ...")
    df = build_labeled_dataset(price_frames, index_frame, hold_days=hold_days,
                               ambiguous_as="loss", earnings_dates=earnings)
    df = df.sort_values("date").reset_index(drop=True)
    print(f"Dataset: {len(df):,} rows, {df['ticker'].nunique()} symbols, "
          f"{df['date'].nunique()} days, win-rate(all)={df['label_win'].mean():.3f}")
    pd.to_pickle(df, DATASET_CACHE)
    return df


def _make_model() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        learning_rate=0.05, max_iter=400, max_leaf_nodes=31,
        min_samples_leaf=200, l2_regularization=1.0,
        early_stopping=True, validation_fraction=0.1, random_state=42,
    )


def _calibrate(base, X_cal, y_cal):
    if _HAS_FROZEN:
        return CalibratedClassifierCV(FrozenEstimator(base), method="isotonic").fit(X_cal, y_cal)
    return CalibratedClassifierCV(base, method="isotonic", cv="prefit").fit(X_cal, y_cal)


def walk_forward(df: pd.DataFrame, hold_days: int, initial_days: int, step_days: int):
    """Train on past, predict the next `step_days` window OOS. Returns df with p_win."""
    dates = sorted(df["date"].unique())
    if len(dates) <= initial_days + step_days:
        sys.exit("Not enough distinct days for walk-forward; ingest more history.")

    df = df.copy()
    df["p_win"] = np.nan
    fold = 0
    start = initial_days
    while start < len(dates):
        train_end_date = dates[start - 1]
        test_dates = set(dates[start: start + step_days])
        if not test_dates:
            break

        # Embargo: drop train rows whose label window overlaps the test start.
        embargo_cut = dates[max(0, start - hold_days)]
        train_mask = df["date"] <= embargo_cut
        test_mask = df["date"].isin(test_dates)
        train = df[train_mask]
        test = df[test_mask]
        if len(train) < 5000 or test.empty:
            start += step_days
            continue

        # Time-ordered calibration split: last 15% of train days for calibration.
        tr_dates = sorted(train["date"].unique())
        cut = tr_dates[int(len(tr_dates) * 0.85)]
        base_tr = train[train["date"] < cut]
        cal_tr = train[train["date"] >= cut]
        if cal_tr["label_win"].nunique() < 2 or base_tr.empty:
            base_tr, cal_tr = train, train  # fallback

        Xb, yb = base_tr[FEATURE_COLUMNS], base_tr["label_win"]
        base = _make_model().fit(Xb, yb)
        try:
            model = _calibrate(base, cal_tr[FEATURE_COLUMNS], cal_tr["label_win"])
        except Exception as exc:
            print(f"  fold {fold}: calibration failed ({exc}); using raw model")
            model = base

        proba = model.predict_proba(test[FEATURE_COLUMNS])[:, 1]
        df.loc[test.index, "p_win"] = proba
        fold += 1
        print(f"  fold {fold}: train_through={train_end_date} "
              f"test={dates[start]}..{dates[min(start+step_days, len(dates))-1]} "
              f"(train={len(train):,}, test={len(test):,})")
        start += step_days

    return df[df["p_win"].notna()].copy()


def _wilson(wins: int, decisive: int) -> float:
    return wilson_lower_bound_placeholder(wins, decisive) if decisive else 0.0


def _econ_summary(rows: pd.DataFrame, cost: float, label: str) -> dict:
    n = len(rows)
    if n == 0:
        return {"label": label, "trades": 0}
    net = rows["realized_r"] - cost
    wins = int((rows["outcome"] == "WIN").sum())
    losses = int((rows["outcome"] == "LOSS").sum())
    timeouts = int((rows["outcome"] == "TIME_EXIT").sum())
    decisive = wins + losses
    dec_mask = rows["outcome"].isin(["WIN", "LOSS"])
    pos = net[net > 0].sum()
    neg = -net[net < 0].sum()
    return {
        "label": label, "trades": n, "wins": wins, "losses": losses, "timeouts": timeouts,
        "raw_win_decisive": round(wins / decisive, 4) if decisive else None,
        "wilson_lb": round(_wilson(wins, decisive), 4) if decisive else None,
        "avg_net_r": round(float(net.mean()), 4),
        "decisive_net_r": round(float(net[dec_mask].mean()), 4) if decisive else None,
        "profit_factor": round(float(pos / neg), 4) if neg > 0 else None,
        "total_net_r": round(float(net.sum()), 2),
    }


def _reliability(rows: pd.DataFrame, bins: int = 10) -> str:
    out = ["  pred_bucket   n     pred_mean  actual_win"]
    edges = np.linspace(0, 1, bins + 1)
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (rows["p_win"] >= lo) & (rows["p_win"] < hi if hi < 1 else rows["p_win"] <= hi)
        sub = rows[m]
        if len(sub) == 0:
            continue
        out.append(f"  [{lo:.2f},{hi:.2f})  {len(sub):>6}   "
                   f"{sub['p_win'].mean():.3f}      {sub['label_win'].mean():.3f}")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="rebuild frames+dataset caches")
    ap.add_argument("--rebuild-dataset", action="store_true", help="rebuild dataset only")
    ap.add_argument("--hold", type=int, default=5)
    ap.add_argument("--top-n", type=int, default=10)
    ap.add_argument("--cost", type=float, default=0.05)
    ap.add_argument("--initial-days", type=int, default=500, help="warm-up days before first OOS")
    ap.add_argument("--step-days", type=int, default=60, help="OOS window / retrain cadence")
    args = ap.parse_args()

    df = get_dataset(args.rebuild or args.rebuild_dataset, args.rebuild, args.hold)

    print(f"\nWalk-forward (initial={args.initial_days}d, step={args.step_days}d, "
          f"embargo={args.hold}d)...")
    oos = walk_forward(df, args.hold, args.initial_days, args.step_days)
    print(f"\nOOS predictions: {len(oos):,} rows over {oos['date'].nunique()} test days.")
    pd.to_pickle(oos, OOS_CACHE)
    print(f"(saved OOS predictions to {os.path.basename(OOS_CACHE)} for analysis)")

    # ---- classification quality ----
    auc = roc_auc_score(oos["label_win"], oos["p_win"])
    brier = brier_score_loss(oos["label_win"], oos["p_win"])
    print("\n" + "=" * 70)
    print("CLASSIFICATION QUALITY (out-of-sample)")
    print("=" * 70)
    print(f"ROC-AUC = {auc:.4f}   (0.5 = no skill; >0.55 starts to be useful)")
    print(f"Brier   = {brier:.4f}  (lower is better; <0.25 beats always-0.5)")
    print("Calibration reliability (pred vs actual win rate):")
    print(_reliability(oos))

    # ---- economic test ----
    cost = args.cost
    # ML selection: top-N by p_win each day.
    picks = (oos.sort_values(["date", "p_win"], ascending=[True, False])
                .groupby("date").head(args.top_n))
    ml = _econ_summary(picks, cost, f"ML top-{args.top_n}/day")
    allrows = _econ_summary(oos, cost, "ALL signals (no selection)")
    # naive baseline: top-N by the rule's own setup quality (no ML).
    rule_rank = (oos.assign(rule_score=oos["chart_setup_quality"] + 0.01 * oos["buy_score"])
                    .sort_values(["date", "rule_score"], ascending=[True, False])
                    .groupby("date").head(args.top_n))
    rule = _econ_summary(rule_rank, cost, f"RULE top-{args.top_n}/day (no ML)")

    print("\n" + "=" * 70)
    print("ECONOMIC TEST (after costs)   baseline to beat: decisive R = -0.037")
    print("=" * 70)
    hdr = f"{'selection':<26}{'trades':>7}{'dec_R':>9}{'avg_R':>9}{'PF':>8}{'wilson':>9}{'totalR':>10}"
    print(hdr)
    print("-" * len(hdr))
    for s in (ml, rule, allrows):
        print(f"{s['label']:<26}{s['trades']:>7}{_n(s.get('decisive_net_r')):>9}"
              f"{_n(s.get('avg_net_r')):>9}{_n(s.get('profit_factor')):>8}"
              f"{_n(s.get('wilson_lb')):>9}{_n(s.get('total_net_r')):>10}")

    print("\nVERDICT:")
    dec = ml.get("decisive_net_r")
    if dec is None:
        print("  No decisive ML trades — inconclusive.")
    elif dec > 0 and dec > rule.get("decisive_net_r", -9):
        print(f"  ML adds edge: decisive R {dec} > 0 and beats rule selection "
              f"({rule.get('decisive_net_r')}). Worth integrating + further validation.")
    else:
        print(f"  ML does NOT clear the bar: decisive R {dec}. Honest result — do "
              f"not ship as a 'winning' model. Next: better features / labels / horizon, "
              f"not a confident rollout.")


def _n(v) -> str:
    if v is None:
        return "—"
    return f"{v:.4f}" if abs(v) < 100 else f"{v:.1f}"


if __name__ == "__main__":
    main()
