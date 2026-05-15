import requests
import yfinance as yf
import pandas as pd
import time

try:
    from app.core.supabase_client import supabase
    SUPABASE_OK = True
except Exception as e:
    print(f"⚠️  Supabase not available: {e}. Running without DB cache.")
    supabase = None
    SUPABASE_OK = False

_hist_cache: dict = {}
_quote_cache: dict = {}
HIST_TTL  = 3600  # 1 hour
QUOTE_TTL = 15    # 15 seconds


def get_latest_quote(ticker: str):
    now = time.time()
    if ticker in _quote_cache and now - _quote_cache[ticker]['ts'] < QUOTE_TTL:
        return _quote_cache[ticker]['data']

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }

    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1m&range=1d"
        response = requests.get(url, headers=headers, timeout=4)
        data = response.json()
        meta = data['chart']['result'][0]['meta']
        live_price = float(meta['regularMarketPrice'])
        prev_close = float(meta['chartPreviousClose'])
        change_pct = ((live_price - prev_close) / prev_close * 100) if prev_close > 0 else 0.0
        result = {"price": round(live_price, 2), "change_percent": round(change_pct, 2)}
        _quote_cache[ticker] = {'data': result, 'ts': time.time()}
        return result
    except Exception as e:
        print(f"[Quote] Yahoo v8 q1 failed for {ticker}: {e}")

    try:
        url2 = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1m&range=1d"
        response2 = requests.get(url2, headers=headers, timeout=4)
        data2 = response2.json()
        meta2 = data2['chart']['result'][0]['meta']
        live_price = float(meta2['regularMarketPrice'])
        prev_close = float(meta2['chartPreviousClose'])
        change_pct = ((live_price - prev_close) / prev_close * 100) if prev_close > 0 else 0.0
        result = {"price": round(live_price, 2), "change_percent": round(change_pct, 2)}
        _quote_cache[ticker] = {'data': result, 'ts': time.time()}
        return result
    except Exception as e:
        print(f"[Quote] Yahoo v8 q2 failed for {ticker}: {e}")

    try:
        tkr = yf.Ticker(ticker)
        info = tkr.fast_info
        live_price = float(info.last_price)
        prev_close = float(info.previous_close)
        change_pct = ((live_price - prev_close) / prev_close * 100) if prev_close > 0 else 0.0
        result = {"price": round(live_price, 2), "change_percent": round(change_pct, 2)}
        _quote_cache[ticker] = {'data': result, 'ts': time.time()}
        return result
    except Exception as e:
        print(f"[Quote] yfinance fallback failed for {ticker}: {e}")

    return {"price": None, "change_percent": 0.0}


def get_historical_data(ticker: str, days: int = 365):
    now = time.time()
    if ticker in _hist_cache and now - _hist_cache[ticker]['ts'] < HIST_TTL:
        return _hist_cache[ticker]['df'].copy()

    # ── Supabase cache (only if available) ────────────────────────────────────
    if SUPABASE_OK and supabase:
        try:
            asset = supabase.table("assets").select("asset_id").eq("ticker", ticker).execute()
            if not asset.data:
                supabase.table("assets").insert({
                    "ticker": ticker,
                    "name": ticker,
                    "exchange": "NSE" if ".NS" in ticker else "NYSE"
                }).execute()
                asset = supabase.table("assets").select("asset_id").eq("ticker", ticker).execute()
            asset_id = asset.data[0]["asset_id"]

            db_data = supabase.table("daily_ohlcv").select("*").eq("asset_id", asset_id).order("date").execute()
            if db_data.data and len(db_data.data) > 30:
                return pd.DataFrame(db_data.data)
        except Exception as e:
            print(f"[HistData] Supabase error for {ticker}: {e}. Falling back to yfinance.")

    # ── Fetch from yfinance ────────────────────────────────────────────────────
    raw = yf.download(ticker, period=f"{days}d", progress=False, auto_adjust=True)

    if raw is None or len(raw) == 0:
        raise ValueError(f"No data found for ticker '{ticker}'. It may be delisted or invalid.")

    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)

    raw.reset_index(inplace=True)
    raw.columns = [str(c).lower() for c in raw.columns]
    df = raw[['date', 'open', 'high', 'low', 'close', 'volume']].copy()
    df = df.dropna()

    if len(df) == 0:
        raise ValueError(f"No valid OHLCV data for ticker '{ticker}'.")

    # ── Save to Supabase if available ──────────────────────────────────────────
    if SUPABASE_OK and supabase:
        try:
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
            if records:
                supabase.table("daily_ohlcv").upsert(records).execute()
        except Exception as e:
            print(f"[HistData] Supabase save failed for {ticker}: {e}")

    _hist_cache[ticker] = {'df': df.copy(), 'ts': time.time()}
    return df
