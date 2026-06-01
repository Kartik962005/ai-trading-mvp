"""Build the public stock_snapshot table from real OHLCV and fundamentals.

Run from backend:
    python scripts/build_snapshot.py
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.data_service import get_fundamentals_data  # noqa: E402
from app.services.screener_service import _download_ohlcv, _technical_metrics, _ticker_frame  # noqa: E402
from app.services.stock_snapshot_service import (  # noqa: E402
    load_frontend_stock_universe,
    upsert_snapshot_rows,
)


DEFAULT_PERIOD = "18mo"
DEFAULT_BATCH_SIZE = 120
DEFAULT_FUNDAMENTAL_WORKERS = 8


def _num(value: Any) -> float | None:
    try:
        if value is None or pd.isna(value):
            return None
        return round(float(value), 4)
    except Exception:
        return None


def _market_cap_values(summary: dict[str, Any]) -> tuple[float | None, float | None]:
    value = _num(summary.get("market_cap"))
    if value is None:
        return None, None
    if summary.get("market_cap_unit") == "crore":
        return value * 10_000_000, value
    return value, round(value / 10_000_000, 4)


def _fundamentals_for(stock: dict[str, Any]) -> dict[str, Any]:
    ticker = stock["ticker"]
    try:
        return get_fundamentals_data(ticker)
    except Exception as exc:
        print(f"[Snapshot] fundamentals failed for {ticker}: {exc}")
        return {"ticker": ticker, "company": {}, "summary": {}, "source": "unavailable"}


def _snapshot_record(stock: dict[str, Any], metrics: dict[str, Any], fundamentals: dict[str, Any]) -> dict[str, Any]:
    summary = fundamentals.get("summary") or {}
    company = fundamentals.get("company") or {}
    market_cap, market_cap_cr = _market_cap_values(summary)
    price = _num(metrics.get("latest_close")) or _num(summary.get("current_price"))
    previous_close = _num(metrics.get("previous_close")) or _num(summary.get("previous_close"))
    today_open = _num(metrics.get("today_open"))
    gap_pct = _num(metrics.get("gap_pct"))
    change_pct = _num(metrics.get("today_return_pct"))
    if change_pct is None and price is not None and previous_close:
        change_pct = round(((price - previous_close) / previous_close) * 100, 4)
    updated_at = datetime.now(timezone.utc).isoformat()
    return {
        "ticker": stock["ticker"],
        "symbol": stock.get("symbol") or stock["ticker"].replace(".NS", ""),
        "name": company.get("name") or stock.get("name"),
        "sector": company.get("sector") or stock.get("sector"),
        "price": price,
        "previous_close": previous_close,
        "today_open": today_open,
        "gap_pct": gap_pct,
        "vwap10": _num(metrics.get("vwap10")),
        "change_pct": change_pct,
        "trailing_pe": _num(summary.get("trailing_pe")),
        "forward_pe": _num(summary.get("forward_pe")),
        "price_to_book": _num(summary.get("price_to_book")),
        "market_cap": market_cap,
        "market_cap_cr": market_cap_cr,
        "roe": _num(summary.get("return_on_equity")),
        "roce": _num(summary.get("return_on_capital")),
        "roa": _num(summary.get("return_on_assets")),
        "debt_to_equity": _num(summary.get("debt_to_equity")),
        "revenue_growth": _num(summary.get("revenue_growth")),
        "profit_growth": _num(summary.get("earnings_growth")),
        "earnings_quarterly_growth": _num(summary.get("earnings_quarterly_growth")),
        "dividend_yield": _num(summary.get("dividend_yield")),
        "operating_margin": _num(summary.get("operating_margins")),
        "profit_margin": _num(summary.get("profit_margins")),
        "beta": _num(summary.get("beta")),
        "enterprise_value": _num(summary.get("enterprise_value")),
        "total_cash": _num(summary.get("total_cash")),
        "total_debt": _num(summary.get("total_debt")),
        "rsi14": _num(metrics.get("rsi14")),
        "mfi14": _num(metrics.get("mfi14")),
        "sma20": _num(metrics.get("sma20")),
        "sma50": _num(metrics.get("sma50")),
        "sma200": _num(metrics.get("sma200")),
        "ema20": _num(metrics.get("ema20")),
        "atr14": _num(metrics.get("atr14")),
        "ret_1w": _num(metrics.get("return_1w_pct")),
        "ret_1m": _num(metrics.get("return_1m_pct")),
        "ret_3m": _num(metrics.get("return_3m_pct")),
        "ret_6m": _num(metrics.get("return_6m_pct")),
        "ret_1y": _num(metrics.get("return_1y_pct")),
        "high_52w": _num(metrics.get("high_52_week")),
        "low_52w": _num(metrics.get("low_52_week")),
        "vol_ratio": _num(metrics.get("volume_ratio_20")),
        "latest_volume": _num(metrics.get("latest_volume")),
        "volume_sma20": _num(metrics.get("volume_sma20")),
        "latest_date": str(metrics.get("latest_date") or "")[:10] or None,
        "source": fundamentals.get("source") or "Yahoo Finance + NSE",
        "updated_at": updated_at,
    }


def _technical_rows_for_batch(batch: list[dict[str, Any]], period: str) -> dict[str, dict[str, Any]]:
    tickers = [stock["ticker"] for stock in batch]
    download = _download_ohlcv(tickers, period)
    rows: dict[str, dict[str, Any]] = {}
    for stock in batch:
        ticker = stock["ticker"]
        try:
            frame = _ticker_frame(download, ticker).dropna()
            if len(frame) < 60:
                print(f"[Snapshot] skipped {ticker}: insufficient OHLCV rows ({len(frame)})")
                continue
            metrics = _technical_metrics(frame, 5)
            latest = frame.iloc[-1]
            prev = frame.iloc[-2] if len(frame) >= 2 else None
            today_open = _num(latest.get("Open") if "Open" in latest else latest.get("open"))
            prev_close = _num(prev.get("Close") if prev is not None and "Close" in prev else prev.get("close") if prev is not None else None)
            high = pd.to_numeric(frame["High"] if "High" in frame.columns else frame["high"], errors="coerce")
            low = pd.to_numeric(frame["Low"] if "Low" in frame.columns else frame["low"], errors="coerce")
            close = pd.to_numeric(frame["Close"] if "Close" in frame.columns else frame["close"], errors="coerce")
            volume = pd.to_numeric(frame["Volume"] if "Volume" in frame.columns else frame["volume"], errors="coerce")
            typical = (high + low + close) / 3
            vol_sum = volume.rolling(10, min_periods=2).sum()
            vwap10 = ((typical * volume).rolling(10, min_periods=2).sum() / vol_sum).iloc[-1]
            metrics.update(
                {
                    "today_open": today_open,
                    "gap_pct": round(((today_open - prev_close) / prev_close) * 100, 4) if today_open is not None and prev_close else None,
                    "vwap10": _num(vwap10),
                }
            )
            rows[ticker] = metrics
        except Exception as exc:
            print(f"[Snapshot] technicals failed for {ticker}: {exc}")
    return rows


def build_snapshot_records(
    stocks: list[dict[str, Any]],
    *,
    period: str = DEFAULT_PERIOD,
    batch_size: int = DEFAULT_BATCH_SIZE,
    fundamental_workers: int = DEFAULT_FUNDAMENTAL_WORKERS,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    total = len(stocks)
    for start in range(0, total, batch_size):
        batch = stocks[start:start + batch_size]
        print(f"[Snapshot] OHLCV batch {start + 1}-{start + len(batch)} of {total}")
        technicals = _technical_rows_for_batch(batch, period)
        if not technicals:
            continue
        fundamentals: dict[str, dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=max(1, fundamental_workers)) as executor:
            future_by_ticker = {executor.submit(_fundamentals_for, stock): stock["ticker"] for stock in batch if stock["ticker"] in technicals}
            for future in as_completed(future_by_ticker):
                ticker = future_by_ticker[future]
                fundamentals[ticker] = future.result()
        for stock in batch:
            ticker = stock["ticker"]
            if ticker not in technicals:
                continue
            records.append(_snapshot_record(stock, technicals[ticker], fundamentals.get(ticker) or {}))
        print(f"[Snapshot] prepared {len(records)} records so far")
    return records


def run_snapshot_build(
    *,
    limit: int | None = None,
    tickers: list[str] | None = None,
    period: str = DEFAULT_PERIOD,
    batch_size: int = DEFAULT_BATCH_SIZE,
    fundamental_workers: int = DEFAULT_FUNDAMENTAL_WORKERS,
    dry_run: bool = False,
) -> dict[str, Any]:
    started = time.time()
    stocks = load_frontend_stock_universe(REPO_ROOT, exchange="NSE")
    if tickers:
        wanted = {ticker.upper() for ticker in tickers}
        wanted |= {f"{ticker.upper()}.NS" for ticker in tickers if "." not in ticker}
        stocks = [stock for stock in stocks if stock["ticker"].upper() in wanted or stock["symbol"].upper() in wanted]
    if limit is not None:
        stocks = stocks[:limit]
    print(f"[Snapshot] building stock_snapshot for {len(stocks)} NSE stocks")
    records = build_snapshot_records(
        stocks,
        period=period,
        batch_size=batch_size,
        fundamental_workers=fundamental_workers,
    )
    if dry_run:
        for record in records[:5]:
            print(
                "[Snapshot] sample "
                f"{record['ticker']}: price={record.get('price')} pe={record.get('trailing_pe')} "
                f"market_cap_cr={record.get('market_cap_cr')} roe={record.get('roe')} "
                f"debt_to_equity={record.get('debt_to_equity')}"
            )
        elapsed = round(time.time() - started, 2)
        print(f"[Snapshot] dry run prepared {len(records)}/{len(stocks)} rows in {elapsed}s")
        return {"requested": len(stocks), "prepared": len(records), "written": 0, "elapsed_seconds": elapsed, "dry_run": True}
    written = upsert_snapshot_rows(records)
    elapsed = round(time.time() - started, 2)
    print(f"[Snapshot] upserted {written}/{len(stocks)} rows in {elapsed}s")
    return {"requested": len(stocks), "written": written, "elapsed_seconds": elapsed}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Supabase stock_snapshot rows.")
    parser.add_argument("--limit", type=int, default=None, help="Limit stocks for smoke tests.")
    parser.add_argument("--tickers", default="", help="Comma-separated ticker/symbol allowlist.")
    parser.add_argument("--period", default=DEFAULT_PERIOD)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--fundamental-workers", type=int, default=DEFAULT_FUNDAMENTAL_WORKERS)
    parser.add_argument("--dry-run", action="store_true", help="Build records and print samples without upserting.")
    args = parser.parse_args()
    tickers = [item.strip() for item in args.tickers.split(",") if item.strip()] or None
    run_snapshot_build(
        limit=args.limit,
        tickers=tickers,
        period=args.period,
        batch_size=args.batch_size,
        fundamental_workers=args.fundamental_workers,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
