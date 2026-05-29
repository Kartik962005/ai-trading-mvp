"""Bulk-ingest multi-year daily OHLCV into Supabase `stock_prices`.

Why: the backtest proved we need a deeper, wider sample before training ML.
One year / ~250 bars gives wide confidence intervals. This script pulls several
years of daily history for a large NSE universe (Nifty 500 by default) plus the
^NSEI index, and upserts it into the same `stock_prices` table the app reads.

Usage (from backend/):
    python scripts/ingest_history.py                 # Nifty 500, 5y, skip already-full
    python scripts/ingest_history.py --range max     # full listing history
    python scripts/ingest_history.py --limit 10      # smoke test: first 10 symbols
    python scripts/ingest_history.py --force          # refetch even if already cached
    python scripts/ingest_history.py --symbols RELIANCE.NS TCS.NS

Notes:
    * Requires SUPABASE_SERVICE_ROLE_KEY in backend/.env (writes are RLS-gated).
    * Reuses the app's own Yahoo chart fetcher so the data format matches exactly.
    * Idempotent: upsert on (ticker, date). Safe to re-run / resume.
    * Polite: small delay between symbols to avoid Yahoo rate limiting.
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time

import pandas as pd
import requests
from dotenv import load_dotenv
from supabase import create_client

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.services.data_service import _fetch_yahoo_chart_data  # noqa: E402
from app.services.daily_signal_engine.config import MARKET_INDEX, NSE_UNIVERSE  # noqa: E402

load_dotenv()

NIFTY500_CSV = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv"
NSE_HOME = "https://www.nseindia.com"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    "Accept": "text/csv,application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _connect():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env "
                 "(service role required to WRITE to stock_prices).")
    return create_client(url, key)


def fetch_nifty500_symbols() -> list[str]:
    """Pull current Nifty 500 constituents from NSE (with cookie warm-up)."""
    sess = requests.Session()
    try:
        sess.get(NSE_HOME, headers=BROWSER_HEADERS, timeout=8)
        resp = sess.get(NIFTY500_CSV, headers=BROWSER_HEADERS, timeout=12)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        col = next((c for c in df.columns if c.strip().lower() == "symbol"), None)
        if not col:
            raise ValueError(f"no Symbol column in CSV; got {list(df.columns)}")
        syms = [f"{str(s).strip()}.NS" for s in df[col].dropna().unique()]
        print(f"[Universe] Nifty 500 from NSE: {len(syms)} symbols")
        return syms
    except Exception as exc:
        print(f"[Universe] NSE fetch failed ({exc}); falling back to built-in "
              f"NSE_UNIVERSE ({len(NSE_UNIVERSE)} symbols).")
        return list(NSE_UNIVERSE)


def existing_count(sb, ticker: str) -> int:
    try:
        r = sb.table("stock_prices").select("ticker", count="exact").eq("ticker", ticker).limit(1).execute()
        return r.count or 0
    except Exception:
        return 0


def upsert_frame(sb, ticker: str, df: pd.DataFrame) -> int:
    records = []
    for _, row in df.iterrows():
        d = row["date"]
        date_str = str(d.date()) if hasattr(d, "date") else str(d)[:10]
        records.append({
            "ticker": ticker,
            "date": date_str,
            "open": round(float(row["open"]), 4),
            "high": round(float(row["high"]), 4),
            "low": round(float(row["low"]), 4),
            "close": round(float(row["close"]), 4),
            "volume": int(row["volume"]) if pd.notna(row["volume"]) else 0,
        })
    written = 0
    for i in range(0, len(records), 100):
        sb.table("stock_prices").upsert(records[i:i + 100], on_conflict="ticker,date").execute()
        written += len(records[i:i + 100])
    return written


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--range", default="5y",
                    choices=["1y", "2y", "5y", "10y", "max"], help="history depth")
    ap.add_argument("--limit", type=int, default=0, help="cap number of symbols (0=all)")
    ap.add_argument("--symbols", nargs="*", help="explicit ticker list (overrides universe)")
    ap.add_argument("--market", default="NSE", choices=["NSE", "BSE", "US"])
    ap.add_argument("--force", action="store_true", help="refetch even if already cached")
    ap.add_argument("--min-existing", type=int, default=900,
                    help="skip symbols already having >= this many rows (unless --force)")
    ap.add_argument("--delay", type=float, default=0.6, help="seconds between symbols")
    args = ap.parse_args()

    sb = _connect()

    if args.symbols:
        universe = args.symbols
    elif args.market == "NSE":
        universe = fetch_nifty500_symbols()
        # Union with the built-in list so nothing we already track is dropped.
        universe = sorted(set(universe) | set(NSE_UNIVERSE))
    else:
        from app.services.daily_signal_engine.config import MARKET_UNIVERSES
        universe = list(MARKET_UNIVERSES.get(args.market, NSE_UNIVERSE))

    index_symbol = MARKET_INDEX[args.market]
    targets = list(universe) + [index_symbol]
    if args.limit:
        targets = targets[: args.limit] + [index_symbol]
        targets = list(dict.fromkeys(targets))  # de-dupe, keep order

    print(f"Ingesting range={args.range} for {len(targets)} symbols "
          f"(incl. index {index_symbol}). force={args.force}\n")

    ok = skipped = failed = total_rows = 0
    t0 = time.time()
    for n, ticker in enumerate(targets, 1):
        if not args.force:
            have = existing_count(sb, ticker)
            if have >= args.min_existing:
                skipped += 1
                print(f"[{n}/{len(targets)}] {ticker}: skip (have {have} rows)")
                continue
        try:
            df = _fetch_yahoo_chart_data(ticker, range_key=args.range, interval="1d")
            if df is None or df.empty or len(df) < 50:
                failed += 1
                print(f"[{n}/{len(targets)}] {ticker}: FAIL (insufficient data)")
                continue
            written = upsert_frame(sb, ticker, df)
            total_rows += written
            ok += 1
            print(f"[{n}/{len(targets)}] {ticker}: wrote {written} rows "
                  f"({df['date'].min().date()} -> {df['date'].max().date()})")
        except Exception as exc:
            failed += 1
            print(f"[{n}/{len(targets)}] {ticker}: ERROR {exc}")
        time.sleep(args.delay)

    dt = time.time() - t0
    print(f"\nDone in {dt:.0f}s. ok={ok} skipped={skipped} failed={failed} "
          f"rows_written={total_rows}")


if __name__ == "__main__":
    main()
