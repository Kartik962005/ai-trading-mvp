"""Fetch a leakage-safe earnings-date calendar for the training universe.

For every symbol we ask yfinance for its historical + scheduled earnings dates
(yfinance returns ~50 going back to ~2014, which fully covers our 5y window).
We store ONLY the dates (as YYYY-MM-DD strings) — no actual/estimate EPS, since
those are revised after the fact and would leak.

How the dates are used downstream (ml_dataset._earnings_features):
  * days_since_earnings  -> uses the most recent PAST date only (fully causal).
  * days_to_earnings     -> uses the next FUTURE date, but CLIPPED to 30 days.
    Indian boards must intimate the exchange of a results date ~2-4 weeks ahead,
    so "earnings within ~30 days" is genuinely public; anything further out is
    treated as "far / unknown" so we never leak a date that wasn't yet scheduled.

    cd backend
    python scripts/fetch_earnings.py
    python scripts/fetch_earnings.py --limit 20 --delay 0.5   # smoke test
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from ingest_history import fetch_nifty500_symbols  # noqa: E402

EARNINGS_CACHE = os.path.join(_HERE, "earnings_dates.pkl")


def _fetch_one(sym: str, *, retries: int, delay: float) -> list[str]:
    """Fetch one symbol's earnings dates, retrying on empty/error (yfinance throttles)."""
    import yfinance as yf

    for attempt in range(retries + 1):
        try:
            ed = yf.Ticker(sym).get_earnings_dates(limit=60)
            if ed is not None and len(ed) > 0:
                return sorted({str(pd.Timestamp(d).date()) for d in ed.index})
        except Exception:
            pass
        if attempt < retries:
            time.sleep(delay * (attempt + 2))  # linear backoff on retry
    return []


def fetch_earnings_dates(
    symbols: list[str], *, delay: float = 0.3, retries: int = 2,
) -> dict[str, list[str]]:
    """Return {ticker: sorted unique 'YYYY-MM-DD' earnings dates}. Missing -> []."""
    out: dict[str, list[str]] = {}
    ok = miss = 0
    for i, sym in enumerate(symbols, 1):
        dates = _fetch_one(sym, retries=retries, delay=delay)
        out[sym] = dates
        if dates:
            ok += 1
        else:
            miss += 1
        if i % 25 == 0 or i == len(symbols):
            print(f"  [{i}/{len(symbols)}] ok={ok} empty={miss} (last={sym}: {len(dates)} dates)")
        if delay:
            time.sleep(delay)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only first N symbols (smoke test)")
    ap.add_argument("--delay", type=float, default=0.3, help="seconds between symbols")
    ap.add_argument("--retries", type=int, default=2, help="retry empties (yfinance throttles)")
    ap.add_argument("--symbols", default="", help="comma-separated override list")
    ap.add_argument("--retry-empty", action="store_true",
                    help="load existing cache and only re-fetch symbols that came back empty")
    args = ap.parse_args()

    if args.symbols:
        symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    else:
        symbols = sorted(set(fetch_nifty500_symbols()))
    if args.limit:
        symbols = symbols[: args.limit]

    existing: dict[str, list[str]] = {}
    if args.retry_empty and os.path.exists(EARNINGS_CACHE):
        existing = pd.read_pickle(EARNINGS_CACHE)
        symbols = [s for s in symbols if not existing.get(s)]
        print(f"Retry-empty mode: {len(existing)} cached, re-fetching {len(symbols)} empties.")

    print(f"Fetching earnings dates for {len(symbols)} symbols "
          f"(delay={args.delay}s, retries={args.retries}) ...")
    fetched = fetch_earnings_dates(symbols, delay=args.delay, retries=args.retries)
    data = {**existing, **fetched}  # merge: keep prior hits, add new ones
    have = sum(1 for v in data.values() if v)
    pd.to_pickle(data, EARNINGS_CACHE)
    print(f"\nSaved {len(data)} symbols ({have} with dates) -> {os.path.basename(EARNINGS_CACHE)}")


if __name__ == "__main__":
    main()
