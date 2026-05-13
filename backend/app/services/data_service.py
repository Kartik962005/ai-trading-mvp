import yfinance as yf
import pandas as pd
from functools import lru_cache
import time
from app.core.supabase_client import supabase

@lru_cache(maxsize=200)
def get_latest_quote(ticker: str):
    time.sleep(0.3)
    data = yf.Ticker(ticker).info
    return {
        "price": data.get("currentPrice") or data.get("regularMarketPrice"),
        "change_percent": data.get("regularMarketChangePercent", 0)
    }

def get_historical_data(ticker: str, days: int = 365):
    # Step 1: Get or create asset in DB
    asset = supabase.table("assets").select("asset_id").eq("ticker", ticker).execute()
    if not asset.data:
        supabase.table("assets").insert({
            "ticker": ticker,
            "name": ticker,
            "exchange": "NSE" if ".NS" in ticker else "NYSE"
        }).execute()
        asset = supabase.table("assets").select("asset_id").eq("ticker", ticker).execute()
    asset_id = asset.data[0]["asset_id"]

    # Step 2: Check Supabase cache
    db_data = supabase.table("daily_ohlcv").select("*").eq("asset_id", asset_id).order("date").execute()
    if db_data.data and len(db_data.data) > 30:
        return pd.DataFrame(db_data.data)

    # Step 3: Fetch from yfinance — FIX for MultiIndex columns
    raw = yf.download(ticker, period=f"{days}d", progress=False, auto_adjust=True)
    
    # yfinance returns MultiIndex columns like ('Close', 'RELIANCE.NS')
    # This flattens it to just ['Close', 'Open', etc.]
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)
    
    raw.reset_index(inplace=True)
    
    # Now safely lowercase
    raw.columns = [str(c).lower() for c in raw.columns]
    
    df = raw[['date', 'open', 'high', 'low', 'close', 'volume']].copy()
    df = df.dropna()  # remove any rows with missing values

    # Step 4: Save to Supabase
    records = []
    for _, row in df.iterrows():
        records.append({
            "asset_id": asset_id,
            "date": str(row['date'].date()) if hasattr(row['date'], 'date') else str(row['date'])[:10],
            "open": float(row['open']),
            "high": float(row['high']),
            "low": float(row['low']),
            "close": float(row['close']),
            "volume": int(row['volume'])
        })
    supabase.table("daily_ohlcv").upsert(records).execute()

    return df