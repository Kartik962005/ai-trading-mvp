from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import math
import os
import random
from typing import Any

import pandas as pd

from app.services.data_service import get_historical_data

from .config import COMPANY_NAME_BY_SYMBOL, DEFAULT_MARKET, MARKET_INDEX, MARKET_UNIVERSES, SECTOR_BY_SYMBOL


def _normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])
    work = frame.copy()
    if isinstance(work.columns, pd.MultiIndex):
        work.columns = work.columns.get_level_values(0)
    work.columns = [str(column).lower() for column in work.columns]
    if "datetime" in work.columns and "date" not in work.columns:
        work = work.rename(columns={"datetime": "date"})
    work["date"] = pd.to_datetime(work["date"], errors="coerce")
    for column in ["open", "high", "low", "close", "volume"]:
        work[column] = pd.to_numeric(work[column], errors="coerce")
    work["volume"] = work["volume"].fillna(0.0)
    work = work.dropna(subset=["date", "open", "high", "low", "close"]).copy()
    work = work.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    return work.reset_index(drop=True)


def _seed_for_symbol(symbol: str) -> int:
    return int(sha256(symbol.encode("utf-8")).hexdigest()[:16], 16)


def _mock_history(symbol: str, days: int = 260) -> pd.DataFrame:
    rng = random.Random(_seed_for_symbol(symbol))
    rows = []
    base = 120 + (abs(_seed_for_symbol(symbol)) % 900)
    drift = 0.0008 if rng.random() > 0.5 else -0.0005
    now = datetime.now(timezone.utc)
    for index in range(days):
        date_value = now - timedelta(days=days - index)
        if date_value.weekday() >= 5:
            continue
        shock = rng.gauss(drift, 0.018)
        open_price = max(5.0, base)
        close_price = max(5.0, open_price * (1 + shock))
        high_price = max(open_price, close_price) * (1 + rng.uniform(0.001, 0.025))
        low_price = min(open_price, close_price) * (1 - rng.uniform(0.001, 0.02))
        volume = rng.randint(200_000, 4_000_000)
        rows.append(
            {
                "date": date_value.replace(hour=0, minute=0, second=0, microsecond=0),
                "open": round(open_price, 2),
                "high": round(high_price, 2),
                "low": round(low_price, 2),
                "close": round(close_price, 2),
                "volume": volume,
            }
        )
        base = close_price
    return pd.DataFrame(rows)


def get_universe(market: str | None = None) -> list[str]:
    selected_market = (market or DEFAULT_MARKET).upper()
    raw = os.getenv(f"{selected_market}_SIGNAL_UNIVERSE", "").strip()
    if raw:
        return [ticker.strip().upper() for ticker in raw.split(",") if ticker.strip()]
    return MARKET_UNIVERSES.get(selected_market, MARKET_UNIVERSES[DEFAULT_MARKET])


def get_symbol_metadata(ticker: str) -> dict[str, str]:
    symbol = ticker.replace(".NS", "").replace(".BO", "")
    return {
        "symbol": symbol,
        "company_name": COMPANY_NAME_BY_SYMBOL.get(symbol, symbol.replace("-", " ")),
        "sector": SECTOR_BY_SYMBOL.get(symbol, "General"),
    }


def fetch_price_history(ticker: str, days: int = 320, *, allow_mock: bool = True) -> pd.DataFrame:
    """Return real OHLCV history for ``ticker``.

    When the live data source cannot return data (network error, delisted/invalid
    symbol) and ``allow_mock`` is False, an EMPTY frame is returned so the caller
    skips the ticker instead of running on fabricated prices. ``allow_mock=True``
    (used for the market index / offline demos) falls back to synthetic data.
    """
    try:
        return _normalize_frame(get_historical_data(ticker, days=days))
    except Exception:
        if not allow_mock:
            return _normalize_frame(None)
        return _normalize_frame(_mock_history(ticker, days=days))


def fetch_market_context(market: str) -> dict[str, Any]:
    market_key = market.upper()
    index_ticker = MARKET_INDEX.get(market_key, MARKET_INDEX[DEFAULT_MARKET])
    return {
        "market": market_key,
        "index_ticker": index_ticker,
        "index_history": fetch_price_history(index_ticker, days=320),
        "universe": get_universe(market_key),
    }
