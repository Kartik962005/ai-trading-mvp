"""Run the leakage-safe walk-forward backtest on cached Supabase history.

Usage:
    cd backend
    python scripts/run_backtest.py
    python scripts/run_backtest.py --risk Aggressive --top-n 10 --cost 0.05

What it does
------------
1. Connects to Supabase (read-only) using the same env vars the app uses.
2. Pulls full OHLCV history for every symbol in NSE_UNIVERSE + the ^NSEI index
   from the `stock_prices` table (trying with and without the `.NS` suffix,
   since the cache may store either form).
3. Feeds those frames to `run_backtest`, which generates the engine's top-N
   picks as-of each historical day using only data available that evening,
   then grades them against the NEXT day's bar.
4. Prints an honest report: raw win rate, Wilson lower-bound win rate, profit
   factor and average net R — overall and sliced by direction / regime /
   confidence bucket.

This MEASURES the current rules. It does not change them. A negative or
break-even result here is the expected motivation for building real ML; a
strongly positive result would tell us the rules already have edge.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# Make `app...` imports work whether run from backend/ or backend/scripts/.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.services.daily_signal_engine.backtest import run_backtest  # noqa: E402
from app.services.daily_signal_engine.config import (  # noqa: E402
    MARKET_INDEX,
    MAX_SELECTED_SIGNALS,
    NSE_UNIVERSE,
)

load_dotenv()

OHLCV_COLS = ["date", "open", "high", "low", "close", "volume"]


def _connect():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        sys.exit("Missing SUPABASE_URL / key env vars. Set them in backend/.env")
    return create_client(url, key)


def _fetch_all(sb, ticker: str) -> pd.DataFrame:
    """Fetch full history for one ticker, paging past the 1000-row limit."""
    rows: list[dict] = []
    page = 0
    page_size = 1000
    while True:
        start = page * page_size
        resp = (
            sb.table("stock_prices")
            .select("date,open,high,low,close,volume")
            .eq("ticker", ticker)
            .order("date")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        page += 1
    if not rows:
        return pd.DataFrame(columns=OHLCV_COLS)
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    for c in ("open", "high", "low", "close", "volume"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df.dropna().sort_values("date").reset_index(drop=True)


def _fetch_with_fallback(sb, ticker: str) -> tuple[str, pd.DataFrame]:
    """Try the ticker as-is, then the bare symbol (no .NS / .BO)."""
    df = _fetch_all(sb, ticker)
    if not df.empty:
        return ticker, df
    bare = ticker.replace(".NS", "").replace(".BO", "")
    if bare != ticker:
        df = _fetch_all(sb, bare)
        if not df.empty:
            return bare, df
    return ticker, df


def load_frames(sb, market: str, symbols: list[str] | None = None, min_bars: int = 120):
    """Load usable price frames + index frame for a market. Reusable by sweeps.

    symbols: explicit ticker list to load. Defaults to the built-in NSE_UNIVERSE.
    """
    index_symbol = MARKET_INDEX[market]
    universe = symbols if symbols is not None else NSE_UNIVERSE
    price_frames: dict[str, pd.DataFrame] = {}
    missing: list[str] = []
    for ticker in universe:
        key, df = _fetch_with_fallback(sb, ticker)
        if df.empty or len(df) < min_bars:
            missing.append(ticker)
            continue
        price_frames[key] = df

    _, index_frame = _fetch_with_fallback(sb, index_symbol)
    if index_frame.empty:
        for alias in ("NIFTY", "NIFTY50", "^NSEI"):
            _, index_frame = _fetch_with_fallback(sb, alias)
            if not index_frame.empty:
                break
    return price_frames, index_frame, missing, index_symbol


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--risk", default="Balanced", choices=["Conservative", "Balanced", "Aggressive"])
    ap.add_argument("--top-n", type=int, default=MAX_SELECTED_SIGNALS)
    ap.add_argument("--cost", type=float, default=0.05, help="round-trip cost in R per trade")
    ap.add_argument("--warmup", type=int, default=60, help="bars to skip before trading")
    ap.add_argument("--hold", type=int, default=5, help="max sessions to hold each trade")
    ap.add_argument("--ambiguous", default="loss", choices=["loss", "win", "neutral"],
                    help="how to score a session that touches target AND stop")
    ap.add_argument("--market", default="NSE", choices=["NSE", "BSE", "US"])
    ap.add_argument("--json", action="store_true", help="dump full result as JSON")
    args = ap.parse_args()

    sb = _connect()

    print(f"Loading history from Supabase (market={args.market}) ...")
    price_frames, index_frame, missing, index_symbol = load_frames(sb, args.market)

    print(f"Loaded {len(price_frames)} symbols with usable history "
          f"({len(missing)} missing/too-short).")
    if missing:
        print(f"  Missing or <120 bars: {', '.join(missing[:25])}"
              f"{' ...' if len(missing) > 25 else ''}")

    if index_frame.empty:
        sys.exit(
            f"\nNo index history found for {index_symbol}. The backtest needs the "
            "index for regime + relative strength. Cache it first (run the app's "
            "data fetch for ^NSEI) or pass --market with an available index."
        )
    if not price_frames:
        sys.exit("\nNo symbol history available — nothing to backtest.")

    print(f"Index history: {len(index_frame)} bars "
          f"({index_frame['date'].min().date()} -> {index_frame['date'].max().date()})\n")
    print("Running walk-forward backtest (this reuses the live engine functions) ...\n")

    report = run_backtest(
        price_frames,
        index_frame,
        risk_level=args.risk,
        top_n=args.top_n,
        cost_r=args.cost,
        warmup_days=args.warmup,
        hold_days=args.hold,
        ambiguous_as=args.ambiguous,
    )

    if args.json:
        print(json.dumps(report, indent=2, default=str))
        return

    _print_report(report)


def _fmt(summary: dict) -> str:
    if summary.get("trades", 0) == 0:
        return "  (no trades)"
    return (
        f"  trades={summary['trades']:<5} "
        f"W/L/Timeout={summary['wins']}/{summary['losses']}/{summary['time_exits']}  "
        f"raw_win={summary.get('raw_win_rate_decisive')}  "
        f"wilson_lb={summary.get('wilson_lb_win_rate')}  "
        f"PF={summary.get('profit_factor')}\n"
        f"        avg_net_R={summary.get('avg_net_r_per_trade')}  "
        f"DECISIVE_R={summary.get('decisive_avg_net_r')}  "
        f"timeout_R={summary.get('time_exit_avg_net_r')}  "
        f"avg_days={summary.get('avg_days_held')}  "
        f"total_R={summary.get('total_net_r')}"
    )


def _print_report(report: dict) -> None:
    cfg = report["config"]
    print("=" * 78)
    print("BACKTEST REPORT — current rule engine, leakage-safe walk-forward")
    print("=" * 78)
    print(f"risk_level={cfg['risk_level']}  top_n/day={cfg['top_n_per_day']}  "
          f"cost_R/trade={cfg['cost_r_per_trade']}  hold_days={cfg['hold_days']}  "
          f"ambiguous_as={cfg['ambiguous_same_day_as']}")
    print(f"trading days simulated={cfg['trading_days_simulated']}  "
          f"skipped (no fwd bar)={cfg['skipped_no_next_bar']}")

    print("\nOVERALL")
    print(_fmt(report["overall"]))

    print("\nBY DIRECTION")
    for k, v in report["by_direction"].items():
        print(f" {k}")
        print(_fmt(v))

    print("\nBY MARKET REGIME")
    for k, v in report["by_regime"].items():
        print(f" {k}")
        print(_fmt(v))

    print("\nBY CONFIDENCE BUCKET")
    for k, v in report["by_confidence"].items():
        print(f" conf {k}")
        print(_fmt(v))

    print("\n" + "-" * 78)
    print("INTERPRETATION")
    print("-" * 78)
    print(report["interpretation"])
    print(
        "\nHow to read this:\n"
        "  * DECISIVE_R is the REAL edge test: avg net R over trades that hit "
        "target or stop. If this is <= 0, the setups don't pick winners.\n"
        "  * timeout_R is from trades that never hit a barrier and were marked to "
        "the horizon close — soft/optimistic, don't lean on it.\n"
        "  * Wilson LB win rate is the HONEST floor given sample size — trust it "
        "over raw win rate.\n"
        "  * Profit factor > 1 means winners' R outweighs losers' R.\n"
        "  * Same-day target+stop is scored as a "
        f"{report['config']['ambiguous_same_day_as'].upper()} (conservative).\n"
    )


if __name__ == "__main__":
    main()
