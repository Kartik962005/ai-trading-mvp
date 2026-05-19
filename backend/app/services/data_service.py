import requests
import yfinance as yf
import pandas as pd
import time

# ── Safe Supabase import ───────────────────────────────────────────────────────
try:
    from app.core.supabase_client import supabase
    SUPABASE_OK = True
    print("✅ Supabase connected")
except Exception as e:
    print(f"⚠️  Supabase not available: {e}. Running without DB cache.")
    supabase = None
    SUPABASE_OK = False

# ── In-memory caches (fast, lost on restart) ──────────────────────────────────
_hist_cache: dict = {}
_quote_cache: dict = {}
HIST_TTL  = 3600   # 1 hour
QUOTE_TTL = 15     # 15 seconds


def get_latest_quote(ticker: str):
    now = time.time()
    if ticker in _quote_cache and now - _quote_cache[ticker]['ts'] < QUOTE_TTL:
        return _quote_cache[ticker]['data']

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
    }

    for base_url in [
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1m&range=1d",
        f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1m&range=1d",
    ]:
        try:
            response = requests.get(base_url, headers=headers, timeout=4)
            meta = response.json()['chart']['result'][0]['meta']
            live_price = float(meta['regularMarketPrice'])
            prev_close = float(meta['chartPreviousClose'])
            change_pct = ((live_price - prev_close) / prev_close * 100) if prev_close > 0 else 0.0
            result = {"price": round(live_price, 2), "change_percent": round(change_pct, 2)}
            _quote_cache[ticker] = {'data': result, 'ts': time.time()}
            return result
        except Exception:
            continue

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
        print(f"[Quote] All sources failed for {ticker}: {e}")

    return {"price": None, "change_percent": 0.0}


def get_historical_data(ticker: str, days: int = 365):
    # ── Layer 1: RAM cache ─────────────────────────────────────────────────────
    now = time.time()
    if ticker in _hist_cache and now - _hist_cache[ticker]['ts'] < HIST_TTL:
        return _hist_cache[ticker]['df'].copy()

    # ── Layer 2: Supabase database (simplified — single table, no asset_id) ───
    if SUPABASE_OK and supabase:
        try:
            db_data = supabase.table("stock_prices") \
                .select("date,open,high,low,close,volume") \
                .eq("ticker", ticker) \
                .order("date") \
                .execute()

            if db_data.data and len(db_data.data) > 50:
                df = pd.DataFrame(db_data.data)
                df['date'] = pd.to_datetime(df['date'])
                for col in ['open','high','low','close','volume']:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                df = df.dropna()
                print(f"[Cache] Supabase hit for {ticker} ({len(df)} rows)")
                _hist_cache[ticker] = {'df': df.copy(), 'ts': time.time()}
                return df
        except Exception as e:
            print(f"[Cache] Supabase read failed for {ticker}: {e}")

    # ── Layer 3: yfinance download ─────────────────────────────────────────────
    print(f"[Download] Fetching {ticker} from yfinance...")
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

    # ── Save to Supabase ───────────────────────────────────────────────────────
    if SUPABASE_OK and supabase:
        try:
            records = []
            for _, row in df.iterrows():
                date_str = str(row['date'].date()) if hasattr(row['date'], 'date') else str(row['date'])[:10]
                records.append({
                    "ticker":  ticker,
                    "date":    date_str,
                    "open":    round(float(row['open']),   4),
                    "high":    round(float(row['high']),   4),
                    "low":     round(float(row['low']),    4),
                    "close":   round(float(row['close']),  4),
                    "volume":  int(row['volume'])
                })
            if records:
                # upsert in chunks of 100 to avoid payload limits
                for i in range(0, len(records), 100):
                    supabase.table("stock_prices").upsert(
                        records[i:i+100],
                        on_conflict="ticker,date"
                    ).execute()
                print(f"[Cache] Saved {len(records)} rows for {ticker} to Supabase")
        except Exception as e:
            print(f"[Cache] Supabase save failed for {ticker}: {e}")

    # ── Save to RAM ────────────────────────────────────────────────────────────
    _hist_cache[ticker] = {'df': df.copy(), 'ts': time.time()}
    return df
