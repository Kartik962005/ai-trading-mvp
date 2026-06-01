"""Backfill Supabase Storage Parquet files from the Postgres stock_prices table.

Safe to re-run: price_store.write_prices merges by date and never deletes from
Postgres. Use --tickers for a small verification subset before a full backfill.
"""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.services import price_store  # noqa: E402

load_dotenv()


def _connect():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.")
    return create_client(url, key)


def _write_ticker(ticker: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    df = pd.DataFrame(rows)
    if "ticker" in df.columns:
        df = df.drop(columns=["ticker"])
    price_store.write_prices(ticker, df)
    print(f"[Migrate] {ticker}: {len(df)} Postgres rows merged to Storage")
    return len(df)


def migrate(page_size: int, tickers: list[str] | None, limit_tickers: int) -> None:
    sb = _connect()
    page = 0
    current_ticker: str | None = None
    current_rows: list[dict] = []
    migrated_tickers = 0
    total_rows = 0

    while True:
        start = page * page_size
        query = (
            sb.table("stock_prices")
            .select("ticker,date,open,high,low,close,volume")
            .order("ticker")
            .order("date")
            .range(start, start + page_size - 1)
        )
        if tickers:
            query = query.in_("ticker", tickers)

        response = query.execute()
        batch = response.data or []
        if not batch:
            break

        for row in batch:
            ticker = str(row.get("ticker") or "").strip()
            if not ticker:
                continue
            if current_ticker is None:
                current_ticker = ticker
            if ticker != current_ticker:
                total_rows += _write_ticker(current_ticker, current_rows)
                migrated_tickers += 1
                if limit_tickers and migrated_tickers >= limit_tickers:
                    print(f"[Migrate] Reached --limit-tickers={limit_tickers}.")
                    print(f"[Migrate] Final total: {migrated_tickers} tickers, {total_rows} rows")
                    return
                current_ticker = ticker
                current_rows = []
            current_rows.append(row)

        print(f"[Migrate] scanned page {page + 1} ({len(batch)} rows)")
        if len(batch) < page_size:
            break
        page += 1

    if current_ticker is not None and current_rows:
        total_rows += _write_ticker(current_ticker, current_rows)
        migrated_tickers += 1

    print(f"[Migrate] Final total: {migrated_tickers} tickers, {total_rows} rows")


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate stock_prices rows to Supabase Storage Parquet files.")
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--tickers", nargs="*", help="optional ticker subset for smoke tests")
    parser.add_argument("--limit-tickers", type=int, default=0, help="stop after N migrated tickers")
    args = parser.parse_args()

    migrate(
        page_size=max(1, args.page_size),
        tickers=args.tickers,
        limit_tickers=max(0, args.limit_tickers),
    )


if __name__ == "__main__":
    main()
