import requests
import yfinance as yf
import pandas as pd
import time
import os
import threading

# ── Safe Supabase import ───────────────────────────────────────────────────────
try:
    from app.core.supabase_client import supabase
    SUPABASE_OK = supabase is not None
    SUPABASE_WRITES_OK = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    if SUPABASE_OK:
        print("[Supabase] connected")
    else:
        print("[Supabase] env vars missing. Running without DB cache.")
except Exception as e:
    print(f"[Supabase] not available: {e}. Running without DB cache.")
    supabase = None
    SUPABASE_OK = False
    SUPABASE_WRITES_OK = False

# ── In-memory caches (fast, lost on restart) ──────────────────────────────────
_hist_cache: dict = {}
_quote_cache: dict = {}
_chart_cache: dict = {}
_fundamentals_cache: dict = {}
_nse_quote_cache: dict = {}
HIST_TTL  = 3600   # 1 hour
QUOTE_TTL = 15     # 15 seconds
CHART_TTL = 3600
FUNDAMENTALS_TTL = 3600 * 6
NSE_QUOTE_TTL = 3600
# Refresh Supabase-cached history when its newest row is older than this many
# calendar days. Covers normal weekends/holidays while forcing a refresh when a
# ticker's cache has fallen months behind (which broke "today"/"last Friday" lookups).
CACHE_MAX_STALE_DAYS = 5
# Serialize writes to the shared Supabase client. It wraps a single httpx
# connection that isn't safe for concurrent use, so simultaneous upserts from
# the movers-scan thread pool trip "[WinError 10035] non-blocking socket
# operation could not be completed immediately" on Windows. One writer at a time
# plus a short bounded retry makes persistence reliable under that concurrency.
_supabase_write_lock = threading.Lock()
_SUPABASE_WRITE_RETRIES = 3
_SUPABASE_WRITE_BACKOFF = 0.5  # seconds; doubled each retry
YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _clean_scalar(value):
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            value = value.item()
        except Exception:
            pass
    if isinstance(value, float):
        return round(value, 4)
    if isinstance(value, int):
        return value
    return value


def _first_non_null(*values):
    for value in values:
        cleaned = _clean_scalar(value)
        if cleaned is not None:
            return cleaned
    return None


def _nse_symbol_from_ticker(ticker: str):
    return ticker.upper().replace(".NS", "").replace(".BO", "")


def _range_for_days(days: int):
    if days <= 5:
        return "5d"
    if days <= 31:
        return "1mo"
    if days <= 93:
        return "3mo"
    if days <= 186:
        return "6mo"
    if days <= 370:
        return "1y"
    if days <= 740:
        return "2y"
    if days <= 1850:
        return "5y"
    if days <= 3700:
        return "10y"
    return "max"


def _normalize_ohlcv_frame(df: pd.DataFrame):
    if df is None or df.empty:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])

    clean = df.copy()
    if isinstance(clean.columns, pd.MultiIndex):
        clean.columns = clean.columns.get_level_values(0)
    clean.columns = [str(c).lower() for c in clean.columns]

    date_col = "datetime" if "datetime" in clean.columns else "date"
    clean = clean.rename(columns={date_col: "date"})
    required_cols = ["date", "open", "high", "low", "close", "volume"]
    if any(col not in clean.columns for col in required_cols):
        return pd.DataFrame(columns=required_cols)
    clean = clean[required_cols].copy()
    clean["date"] = pd.to_datetime(clean["date"], errors="coerce")
    for col in ["open", "high", "low", "close", "volume"]:
        clean[col] = pd.to_numeric(clean[col], errors="coerce")
    clean["volume"] = clean["volume"].fillna(0)
    clean = clean.dropna(subset=["date", "open", "high", "low", "close"])
    clean = clean.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    return clean.reset_index(drop=True)


def _fetch_yahoo_chart_data(ticker: str, range_key: str = "1y", interval: str = "1d"):
    last_error = None
    params = {
        "range": range_key,
        "interval": interval,
        "includePrePost": "false",
        "events": "div,splits",
    }

    for host in ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]:
        url = f"https://{host}/v8/finance/chart/{ticker}"
        try:
            response = requests.get(url, params=params, headers=YAHOO_HEADERS, timeout=10)
            response.raise_for_status()
            payload = response.json()
            chart = payload.get("chart", {})
            error = chart.get("error")
            if error:
                raise ValueError(error.get("description") or str(error))

            result = (chart.get("result") or [None])[0]
            if not result or not result.get("timestamp"):
                raise ValueError(f"No Yahoo chart timestamps for ticker '{ticker}'.")

            quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
            timestamps = result["timestamp"]
            row_count = len(timestamps)

            def values_for(name: str, default=None):
                values = list(quote.get(name) or [])
                if len(values) < row_count:
                    values.extend([default] * (row_count - len(values)))
                return values[:row_count]

            rows = {
                "date": pd.to_datetime(timestamps, unit="s", utc=True).tz_convert(None),
                "open": values_for("open"),
                "high": values_for("high"),
                "low": values_for("low"),
                "close": values_for("close"),
                "volume": values_for("volume", 0),
            }
            df = _normalize_ohlcv_frame(pd.DataFrame(rows))
            if df.empty:
                raise ValueError(f"No valid Yahoo chart rows for ticker '{ticker}'.")
            return df
        except Exception as exc:
            last_error = exc
            print(f"[YahooChart] {host} failed for {ticker} ({range_key}/{interval}): {exc}")

    raise ValueError(f"Yahoo chart data unavailable for '{ticker}': {last_error}")


def get_nse_quote_data(ticker: str):
    symbol = _nse_symbol_from_ticker(ticker)
    now = time.time()
    if symbol in _nse_quote_cache and now - _nse_quote_cache[symbol]["ts"] < NSE_QUOTE_TTL:
        return _nse_quote_cache[symbol]["data"]

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"https://www.nseindia.com/get-quotes/equity?symbol={symbol}",
    }

    session = requests.Session()
    try:
        session.get("https://www.nseindia.com", headers=headers, timeout=6)
        quote = session.get(
            "https://www.nseindia.com/api/quote-equity",
            params={"symbol": symbol},
            headers=headers,
            timeout=8,
        ).json()
        trade_info = session.get(
            "https://www.nseindia.com/api/quote-equity",
            params={"symbol": symbol, "section": "trade_info"},
            headers=headers,
            timeout=8,
        ).json()
    except Exception as e:
        print(f"[NSE] quote lookup failed for {symbol}: {e}")
        return {}

    price_info = quote.get("priceInfo", {})
    metadata = quote.get("metadata", {})
    security_info = quote.get("securityInfo", {})
    industry_info = quote.get("industryInfo", {})
    trade = trade_info.get("marketDeptOrderBook", {}).get("tradeInfo", {})

    week_range = price_info.get("weekHighLow", {})
    intraday = price_info.get("intraDayHighLow", {})
    result = {
        "symbol": symbol,
        "company_name": _first_non_null(metadata.get("companyName"), quote.get("info", {}).get("companyName")),
        "industry": _first_non_null(industry_info.get("industry"), metadata.get("industry")),
        "sector": _first_non_null(industry_info.get("sector"), metadata.get("pdSectorInd")),
        "current_price": _first_non_null(price_info.get("lastPrice")),
        "previous_close": _first_non_null(price_info.get("previousClose")),
        "day_high": _first_non_null(intraday.get("max")),
        "day_low": _first_non_null(intraday.get("min")),
        "high_52_week": _first_non_null(week_range.get("max")),
        "low_52_week": _first_non_null(week_range.get("min")),
        "market_cap": _first_non_null(trade.get("totalMarketCap")),
        "free_float_market_cap": _first_non_null(trade.get("ffmc")),
        "trailing_pe": _first_non_null(metadata.get("pdSymbolPe")),
        "sector_pe": _first_non_null(metadata.get("pdSectorPe")),
        "face_value": _first_non_null(security_info.get("faceValue")),
        "isin": _first_non_null(metadata.get("isin")),
        "listing_date": _first_non_null(metadata.get("listingDate")),
        "source": "NSE",
    }
    _nse_quote_cache[symbol] = {"data": result, "ts": time.time()}
    return result


def _statement_to_table(df: pd.DataFrame | None, max_columns: int = 6, max_rows: int = 14):
    if df is None or df.empty:
        return {"columns": [], "rows": []}

    table = df.copy()

    if isinstance(table.columns, pd.MultiIndex):
        table.columns = table.columns.get_level_values(0)
    if isinstance(table.index, pd.MultiIndex):
        table.index = table.index.get_level_values(0)

    selected_columns = list(table.columns[:max_columns])
    columns = []
    for col in selected_columns:
        if isinstance(col, pd.Timestamp):
            columns.append(col.strftime("%b %Y"))
        else:
            columns.append(str(col))

    rows = []
    for label, row in table.head(max_rows).iterrows():
        values = [_clean_scalar(row[col]) for col in selected_columns]
        if not any(value is not None for value in values):
            continue
        rows.append({
            "label": str(label),
            "values": values,
        })

    return {"columns": columns, "rows": rows}


def get_fundamentals_data(ticker: str):
    now = time.time()
    if ticker in _fundamentals_cache and now - _fundamentals_cache[ticker]["ts"] < FUNDAMENTALS_TTL:
        return _fundamentals_cache[ticker]["data"]

    stock = yf.Ticker(ticker)
    info = {}
    fast_info = {}
    nse_quote = get_nse_quote_data(ticker) if ticker.upper().endswith(".NS") else {}

    try:
        info = stock.info or {}
    except Exception as e:
        print(f"[Fundamentals] info lookup failed for {ticker}: {e}")

    try:
        fast_info = stock.fast_info or {}
    except Exception as e:
        print(f"[Fundamentals] fast_info lookup failed for {ticker}: {e}")

    history = pd.DataFrame()
    try:
        history = stock.history(period="1y", interval="1d", auto_adjust=False)
    except Exception as e:
        print(f"[Fundamentals] history lookup failed for {ticker}: {e}")

    current_price = _first_non_null(
        nse_quote.get("current_price"),
        fast_info.get("lastPrice"),
        fast_info.get("last_price"),
        info.get("currentPrice"),
        info.get("regularMarketPrice"),
        history["Close"].iloc[-1] if not history.empty else None,
    )
    previous_close = _first_non_null(
        nse_quote.get("previous_close"),
        fast_info.get("previousClose"),
        fast_info.get("previous_close"),
        info.get("previousClose"),
    )
    week_high = _first_non_null(
        nse_quote.get("high_52_week"),
        info.get("fiftyTwoWeekHigh"),
        fast_info.get("yearHigh"),
        fast_info.get("year_high"),
        history["High"].max() if not history.empty else None,
    )
    week_low = _first_non_null(
        nse_quote.get("low_52_week"),
        info.get("fiftyTwoWeekLow"),
        fast_info.get("yearLow"),
        fast_info.get("year_low"),
        history["Low"].min() if not history.empty else None,
    )

    quarterly_income = getattr(stock, "quarterly_income_stmt", pd.DataFrame())
    annual_income = getattr(stock, "income_stmt", pd.DataFrame())
    annual_balance = getattr(stock, "balance_sheet", pd.DataFrame())
    annual_cash_flow = getattr(stock, "cashflow", pd.DataFrame())

    if quarterly_income is None or quarterly_income.empty:
        quarterly_income = getattr(stock, "quarterly_financials", pd.DataFrame())
    if annual_income is None or annual_income.empty:
        annual_income = getattr(stock, "financials", pd.DataFrame())

    result = {
        "ticker": ticker,
        "company": {
            "name": _first_non_null(nse_quote.get("company_name"), info.get("longName"), info.get("shortName"), ticker),
            "sector": _first_non_null(nse_quote.get("sector"), info.get("sector")),
            "industry": _first_non_null(nse_quote.get("industry"), info.get("industry")),
            "website": _clean_scalar(info.get("website")),
            "description": _clean_scalar(info.get("longBusinessSummary")),
            "city": _clean_scalar(info.get("city")),
            "state": _clean_scalar(info.get("state")),
            "country": _clean_scalar(info.get("country")),
            "employees": _clean_scalar(info.get("fullTimeEmployees")),
        },
        "summary": {
            "current_price": current_price,
            "previous_close": previous_close,
            "market_cap": _first_non_null(nse_quote.get("market_cap"), fast_info.get("marketCap"), fast_info.get("market_cap"), info.get("marketCap")),
            "market_cap_unit": "crore" if nse_quote.get("market_cap") is not None else "raw",
            "high_52_week": week_high,
            "low_52_week": week_low,
            "day_high": _clean_scalar(nse_quote.get("day_high")),
            "day_low": _clean_scalar(nse_quote.get("day_low")),
            "trailing_pe": _first_non_null(nse_quote.get("trailing_pe"), info.get("trailingPE")),
            "sector_pe": _clean_scalar(nse_quote.get("sector_pe")),
            "forward_pe": _clean_scalar(info.get("forwardPE")),
            "book_value": _clean_scalar(info.get("bookValue")),
            "price_to_book": _clean_scalar(info.get("priceToBook")),
            "dividend_yield": _clean_scalar((info.get("dividendYield") or 0) * 100) if info.get("dividendYield") is not None else None,
            "return_on_equity": _clean_scalar((info.get("returnOnEquity") or 0) * 100) if info.get("returnOnEquity") is not None else None,
            "return_on_assets": _clean_scalar((info.get("returnOnAssets") or 0) * 100) if info.get("returnOnAssets") is not None else None,
            "profit_margins": _clean_scalar((info.get("profitMargins") or 0) * 100) if info.get("profitMargins") is not None else None,
            "operating_margins": _clean_scalar((info.get("operatingMargins") or 0) * 100) if info.get("operatingMargins") is not None else None,
            "revenue_growth": _clean_scalar((info.get("revenueGrowth") or 0) * 100) if info.get("revenueGrowth") is not None else None,
            "earnings_growth": _clean_scalar((info.get("earningsGrowth") or 0) * 100) if info.get("earningsGrowth") is not None else None,
            "earnings_quarterly_growth": _clean_scalar((info.get("earningsQuarterlyGrowth") or 0) * 100) if info.get("earningsQuarterlyGrowth") is not None else None,
            "beta": _clean_scalar(info.get("beta")),
            "enterprise_value": _clean_scalar(info.get("enterpriseValue")),
            "total_cash": _clean_scalar(info.get("totalCash")),
            "total_debt": _clean_scalar(info.get("totalDebt")),
            "recommendation": _clean_scalar(info.get("recommendationKey")),
            "face_value": _clean_scalar(nse_quote.get("face_value")),
            "isin": _clean_scalar(nse_quote.get("isin")),
            "listing_date": _clean_scalar(nse_quote.get("listing_date")),
            "quote_type": _clean_scalar(info.get("quoteType")),
            "currency": _clean_scalar(info.get("currency")),
            "exchange": _clean_scalar(info.get("exchange")),
        },
        "ratios": [
            {"label": "Trailing P/E", "value": _first_non_null(nse_quote.get("trailing_pe"), info.get("trailingPE")), "kind": "number"},
            {"label": "Sector P/E", "value": _clean_scalar(nse_quote.get("sector_pe")), "kind": "number"},
            {"label": "Forward P/E", "value": _clean_scalar(info.get("forwardPE")), "kind": "number"},
            {"label": "Price / Book", "value": _clean_scalar(info.get("priceToBook")), "kind": "number"},
            {"label": "Dividend Yield", "value": _clean_scalar((info.get("dividendYield") or 0) * 100) if info.get("dividendYield") is not None else None, "kind": "percent"},
            {"label": "ROE", "value": _clean_scalar((info.get("returnOnEquity") or 0) * 100) if info.get("returnOnEquity") is not None else None, "kind": "percent"},
            {"label": "ROA", "value": _clean_scalar((info.get("returnOnAssets") or 0) * 100) if info.get("returnOnAssets") is not None else None, "kind": "percent"},
            {"label": "Profit Margin", "value": _clean_scalar((info.get("profitMargins") or 0) * 100) if info.get("profitMargins") is not None else None, "kind": "percent"},
            {"label": "Operating Margin", "value": _clean_scalar((info.get("operatingMargins") or 0) * 100) if info.get("operatingMargins") is not None else None, "kind": "percent"},
        ],
        "statements": {
            "quarterly_results": _statement_to_table(quarterly_income, max_columns=8, max_rows=12),
            "profit_and_loss": _statement_to_table(annual_income, max_columns=8, max_rows=14),
            "balance_sheet": _statement_to_table(annual_balance, max_columns=8, max_rows=14),
            "cash_flow": _statement_to_table(annual_cash_flow, max_columns=8, max_rows=14),
        },
        "source": "NSE + yfinance fallback" if nse_quote else "yfinance",
    }

    _fundamentals_cache[ticker] = {"data": result, "ts": time.time()}
    return result


def get_chart_data(ticker: str, range_key: str = "1y"):
    range_key = (range_key or "1y").lower()
    cache_key = f"{ticker}:{range_key}"
    now = time.time()
    if cache_key in _chart_cache and now - _chart_cache[cache_key]["ts"] < CHART_TTL:
        return _chart_cache[cache_key]["df"].copy()

    options = {
        "1d":  ("1d",  "5m"),
        "1w":  ("5d",  "30m"),
        "1mo": ("1mo", "1d"),
        "1m":  ("1mo", "1d"),
        "1y":  ("1y",  "1d"),
        "max": ("max", "1d"),   # all data since listing
        "all": ("max", "1d"),   # alias
    }
    period, interval = options.get(range_key, options["1y"])

    try:
        df = _fetch_yahoo_chart_data(ticker, period, interval)
    except Exception as exc:
        print(f"[Chart] Direct Yahoo chart failed for {ticker}: {exc}")
        if range_key in {"1y", "1m", "1mo"}:
            df = get_historical_data(ticker, days=365)
            if range_key in {"1m", "1mo"}:
                df = df.tail(31).copy()
        else:
            raw = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
            raw = _normalize_ohlcv_frame(raw.reset_index() if raw is not None else raw)
            df = raw

    if df.empty:
        raise ValueError(f"No valid chart data for ticker '{ticker}'.")
    _chart_cache[cache_key] = {"df": df.copy(), "ts": time.time()}
    return df


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
        cached_df = _hist_cache[ticker]['df'].copy()
        required_rows = max(50, min(days, int(days * 0.55)))
        if len(cached_df) >= required_rows:
            return cached_df

    # ── Layer 2: Supabase database (simplified — single table, no asset_id) ───
    stale_cache_df = None  # kept as a last-resort fallback if a Yahoo refresh fails
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
                latest_cached = df['date'].max()
                stale_days = (pd.Timestamp.now().normalize() - latest_cached.normalize()).days
                # Only trust the cache when its newest row is recent enough. A
                # cache that ends months ago must be refreshed so date-sensitive
                # lookups (today, last Friday, movers) see real recent sessions.
                if stale_days <= CACHE_MAX_STALE_DAYS:
                    print(f"[Cache] Supabase hit for {ticker} ({len(df)} rows, latest {latest_cached.date()})")
                    _hist_cache[ticker] = {'df': df.copy(), 'ts': time.time()}
                    return df
                print(f"[Cache] Supabase data for {ticker} is stale (latest {latest_cached.date()}, {stale_days}d old) - refreshing from Yahoo.")
                stale_cache_df = df
        except Exception as e:
            print(f"[Cache] Supabase read failed for {ticker}: {e}")

    # Layer 3: direct Yahoo chart API, with yfinance only as a final fallback.
    df = None
    try:
        print(f"[Download] Fetching {ticker} from Yahoo chart API...")
        df = _fetch_yahoo_chart_data(ticker, range_key=_range_for_days(days), interval="1d")
        if days and len(df) > days:
            df = df.tail(days).copy()
    except Exception as direct_error:
        print(f"[Download] Yahoo chart API failed for {ticker}: {direct_error}")
        print(f"[Download] Fetching {ticker} from yfinance fallback...")
        try:
            raw = yf.download(ticker, period=f"{days}d", progress=False, auto_adjust=True)
            df = _normalize_ohlcv_frame(raw.reset_index() if raw is not None else raw)
        except Exception as yf_error:
            print(f"[Download] yfinance fallback failed for {ticker}: {yf_error}")
            df = None

    if df is None or len(df) == 0:
        # A stale cached answer beats no answer at all when Yahoo is unreachable.
        if stale_cache_df is not None and len(stale_cache_df) > 0:
            print(f"[Download] Falling back to stale Supabase cache for {ticker}.")
            _hist_cache[ticker] = {'df': stale_cache_df.copy(), 'ts': time.time()}
            return stale_cache_df
        raise ValueError(f"No valid OHLCV data for ticker '{ticker}'.")

    # ── Save to Supabase ───────────────────────────────────────────────────────
    if SUPABASE_OK and supabase and SUPABASE_WRITES_OK:
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
                # One writer at a time (see _supabase_write_lock) so concurrent
                # movers-scan threads don't race on the shared client's socket.
                with _supabase_write_lock:
                    # upsert in chunks of 100 to avoid payload limits
                    for i in range(0, len(records), 100):
                        chunk = records[i:i+100]
                        for attempt in range(_SUPABASE_WRITE_RETRIES):
                            try:
                                supabase.table("stock_prices").upsert(
                                    chunk,
                                    on_conflict="ticker,date"
                                ).execute()
                                break
                            except Exception as chunk_err:
                                if attempt == _SUPABASE_WRITE_RETRIES - 1:
                                    raise
                                print(f"[Cache] Supabase upsert retry {attempt+1}/{_SUPABASE_WRITE_RETRIES} for {ticker}: {chunk_err}")
                                time.sleep(_SUPABASE_WRITE_BACKOFF * (2 ** attempt))
                print(f"[Cache] Saved {len(records)} rows for {ticker} to Supabase")
        except Exception as e:
            print(f"[Cache] Supabase save failed for {ticker}: {e}")

    # ── Save to RAM ────────────────────────────────────────────────────────────
    _hist_cache[ticker] = {'df': df.copy(), 'ts': time.time()}
    return df
