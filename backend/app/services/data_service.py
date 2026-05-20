import requests
import yfinance as yf
import pandas as pd
import time

# ── Safe Supabase import ───────────────────────────────────────────────────────
try:
    from app.core.supabase_client import supabase
    SUPABASE_OK = supabase is not None
    if SUPABASE_OK:
        print("[Supabase] connected")
    else:
        print("[Supabase] env vars missing. Running without DB cache.")
except Exception as e:
    print(f"[Supabase] not available: {e}. Running without DB cache.")
    supabase = None
    SUPABASE_OK = False

# ── In-memory caches (fast, lost on restart) ──────────────────────────────────
_hist_cache: dict = {}
_quote_cache: dict = {}
_fundamentals_cache: dict = {}
_nse_quote_cache: dict = {}
HIST_TTL  = 3600   # 1 hour
QUOTE_TTL = 15     # 15 seconds
FUNDAMENTALS_TTL = 3600 * 6
NSE_QUOTE_TTL = 3600


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

    if range_key in {"1y", "1m", "1mo"}:
        df = get_historical_data(ticker, days=365)
        if range_key in {"1m", "1mo"}:
            df = df.tail(31).copy()
    else:
        raw = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
        if raw is None or len(raw) == 0:
            raise ValueError(f"No chart data found for ticker '{ticker}'.")
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        raw.reset_index(inplace=True)
        raw.columns = [str(c).lower() for c in raw.columns]
        date_col = "datetime" if "datetime" in raw.columns else "date"
        df = raw[[date_col, "open", "high", "low", "close", "volume"]].copy()
        df = df.rename(columns={date_col: "date"}).dropna()

    if df.empty:
        raise ValueError(f"No valid chart data for ticker '{ticker}'.")
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
