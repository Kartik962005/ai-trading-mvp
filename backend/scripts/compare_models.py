"""Fair, leakage-safe, walk-forward benchmark of several ML models on the SAME
NSE dataset and the SAME folds. Produces the comparison table for the paper:
classification quality (ROC-AUC, accuracy, Brier) + economic test of the top-N
picks/day (decisive R, avg R, profit factor, Wilson LB, total R), all out-of-sample.

    cd backend
    python scripts/compare_models.py --top-n 5 --cost 0.05
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score  # noqa: E402

from app.services.daily_signal_engine.ml_dataset import FEATURE_COLUMNS  # noqa: E402
from app.services.daily_signal_engine.scoring import wilson_lower_bound_placeholder  # noqa: E402

DATASET_CACHE = os.path.join(_HERE, "ml_dataset.pkl")


def make_model(name: str):
    if name == "logreg":
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=1.0))
    if name == "rf":
        from sklearn.ensemble import RandomForestClassifier
        return RandomForestClassifier(n_estimators=150, min_samples_leaf=50, n_jobs=-1, random_state=42)
    if name == "mlp":
        from sklearn.neural_network import MLPClassifier
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        return make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(64, 32), early_stopping=True, max_iter=60, random_state=42))
    if name == "xgb":
        from xgboost import XGBClassifier
        return XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.05, tree_method="hist",
                             subsample=0.8, colsample_bytree=0.8, n_jobs=-1, eval_metric="logloss", random_state=42)
    if name == "lgbm":
        from lightgbm import LGBMClassifier
        return LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=31, min_child_samples=200,
                              subsample=0.8, colsample_bytree=0.8, n_jobs=-1, random_state=42, verbose=-1)
    if name in ("histgbm", "histgbm_cal"):
        from sklearn.ensemble import HistGradientBoostingClassifier
        return HistGradientBoostingClassifier(learning_rate=0.05, max_iter=400, max_leaf_nodes=31,
                                              min_samples_leaf=200, l2_regularization=1.0, early_stopping=True,
                                              validation_fraction=0.1, random_state=42)
    raise ValueError(name)


def _calibrate(base, X_cal, y_cal):
    from sklearn.calibration import CalibratedClassifierCV
    try:
        from sklearn.frozen import FrozenEstimator
        return CalibratedClassifierCV(FrozenEstimator(base), method="isotonic").fit(X_cal, y_cal)
    except Exception:
        return CalibratedClassifierCV(base, method="isotonic", cv="prefit").fit(X_cal, y_cal)


def walk_forward(df: pd.DataFrame, name: str, hold: int, initial: int, step: int, calibrate: bool) -> pd.DataFrame:
    dates = sorted(df["date"].unique())
    df = df.copy()
    df["p"] = np.nan
    start = initial
    fold = 0
    while start < len(dates):
        embargo_cut = dates[max(0, start - hold)]
        test_dates = set(dates[start: start + step])
        if not test_dates:
            break
        train = df[df["date"] <= embargo_cut]
        test = df[df["date"].isin(test_dates)]
        if len(train) < 5000 or test.empty:
            start += step
            continue
        if name == "histgbm_cvcal":
            # Time-respecting cross-validated isotonic calibration that uses ALL
            # training data (no held-out base-training penalty).
            from sklearn.calibration import CalibratedClassifierCV
            from sklearn.model_selection import TimeSeriesSplit
            tr = train.sort_values("date")
            model = CalibratedClassifierCV(
                make_model("histgbm"), method="isotonic", cv=TimeSeriesSplit(3)
            ).fit(tr[FEATURE_COLUMNS], tr["label_win"])
        elif calibrate:
            tr_dates = sorted(train["date"].unique())
            cut = tr_dates[int(len(tr_dates) * 0.85)]
            base_tr = train[train["date"] < cut]
            cal = train[train["date"] >= cut]
            if base_tr.empty or cal["label_win"].nunique() < 2:
                base_tr, cal = train, train
            base = make_model(name).fit(base_tr[FEATURE_COLUMNS], base_tr["label_win"])
            try:
                model = _calibrate(base, cal[FEATURE_COLUMNS], cal["label_win"])
            except Exception:
                model = base
        else:
            model = make_model(name).fit(train[FEATURE_COLUMNS], train["label_win"])
        df.loc[test.index, "p"] = model.predict_proba(test[FEATURE_COLUMNS])[:, 1]
        fold += 1
        start += step
    return df[df["p"].notna()].copy()


def econ(rows: pd.DataFrame, cost: float, topn: int) -> dict:
    picks = rows.sort_values(["date", "p"], ascending=[True, False]).groupby("date").head(topn)
    net = picks["realized_r"] - cost
    wins = int((picks["outcome"] == "WIN").sum())
    losses = int((picks["outcome"] == "LOSS").sum())
    decisive = wins + losses
    dec_mask = picks["outcome"].isin(["WIN", "LOSS"])
    pos = net[net > 0].sum()
    neg = -net[net < 0].sum()
    return {
        "trades": len(picks),
        "dec_R": round(float(net[dec_mask].mean()), 4) if decisive else None,
        "avg_R": round(float(net.mean()), 4),
        "PF": round(float(pos / neg), 4) if neg > 0 else None,
        "wilson": round(float(wilson_lower_bound_placeholder(wins, decisive)), 4) if decisive else None,
        "totalR": round(float(net.sum()), 1),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hold", type=int, default=5)
    ap.add_argument("--initial-days", type=int, default=500)
    ap.add_argument("--step-days", type=int, default=60)
    ap.add_argument("--top-n", type=int, default=5)
    ap.add_argument("--cost", type=float, default=0.05)
    ap.add_argument("--models", default="logreg,rf,mlp,xgb,lgbm,histgbm,histgbm_cal")
    args = ap.parse_args()

    print(f"Loading dataset from {os.path.basename(DATASET_CACHE)} ...")
    df = pd.read_pickle(DATASET_CACHE).sort_values("date").reset_index(drop=True)
    print(f"Dataset: {len(df):,} rows, {df['ticker'].nunique()} tickers, {df['date'].nunique()} days, "
          f"base win-rate={df['label_win'].mean():.3f}\n")

    rows = []
    for name in [m.strip() for m in args.models.split(",") if m.strip()]:
        calibrate = name == "histgbm_cal"
        t0 = time.time()
        try:
            oos = walk_forward(df, name, args.hold, args.initial_days, args.step_days, calibrate)
        except Exception as exc:  # e.g., xgboost/lightgbm missing
            print(f"[{name}] SKIPPED ({exc})")
            continue
        auc = roc_auc_score(oos["label_win"], oos["p"])
        brier = brier_score_loss(oos["label_win"], oos["p"])
        acc = accuracy_score(oos["label_win"], (oos["p"] >= 0.5).astype(int))
        e = econ(oos, args.cost, args.top_n)
        rows.append({"model": name, "n_oos": len(oos), "AUC": round(auc, 4), "ACC@0.5": round(acc, 4),
                     "Brier": round(brier, 4), **e})
        print(f"[{name}] done in {time.time()-t0:.0f}s  AUC={auc:.4f} Brier={brier:.4f} "
              f"dec_R={e['dec_R']} PF={e['PF']} totalR={e['totalR']}")

    table = pd.DataFrame(rows)
    out_csv = os.path.join(_HERE, "model_comparison.csv")
    table.to_csv(out_csv, index=False)
    print("\n" + "=" * 100)
    print(f"MODEL COMPARISON  (walk-forward OOS; top-{args.top_n}/day; cost={args.cost}R; baseline rule dec_R to beat ~ -0.037)")
    print("=" * 100)
    print(table.to_string(index=False))
    print(f"\nSaved: {out_csv}")


if __name__ == "__main__":
    main()
