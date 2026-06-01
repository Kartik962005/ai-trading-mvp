import pandas as pd
import ta
import yfinance as yf
from textblob import TextBlob
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import html
import re
import math
import numpy as np
import time
import os
import threading
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta

from app.services.daily_signal_engine import build_live_feature_values, evaluate_technical_setup, predict_signal_probabilities

# ── In-memory analysis cache ──────────────────────────────────────────────────
_analysis_cache: dict = {}
ANALYSIS_TTL = 3600
_sentiment_cache: dict = {}
_sentiment_inflight: dict = {}
_sentiment_lock = threading.Lock()
_sentiment_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="news-sentiment")

# ── Supabase for persistent cache ─────────────────────────────────────────────
try:
    from app.core.supabase_client import supabase as _sb
    _SUPABASE_OK = True
    _SUPABASE_WRITES_OK = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
except Exception:
    _sb = None
    _SUPABASE_OK = False
    _SUPABASE_WRITES_OK = False


def _neutral_sentiment(message: str = "News sentiment is updating in the background.") -> dict:
    return {"score": 0, "label": "Neutral", "headlines": [message], "stories": []}


def _rss_root(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req, timeout=3)
    return ET.fromstring(response.read())


def _fetch_rss_roots(urls: dict[str, str]) -> dict:
    executor = ThreadPoolExecutor(max_workers=min(2, len(urls)))
    futures = {name: executor.submit(_rss_root, url) for name, url in urls.items()}
    done, _ = wait(futures.values(), timeout=3.5)
    roots = {}
    for name, future in futures.items():
        if future not in done:
            future.cancel()
            continue
        try:
            roots[name] = future.result()
        except Exception:
            pass
    executor.shutdown(wait=False, cancel_futures=True)
    return roots


def _finish_sentiment_fetch(ticker: str, future) -> None:
    try:
        sentiment = future.result()
    except Exception as exc:
        print(f"[News] Sentiment fetch failed for {ticker}: {exc}")
        sentiment = _neutral_sentiment("Live news feed unavailable.")
    with _sentiment_lock:
        _sentiment_cache[ticker] = {"result": sentiment, "ts": time.time()}
        _sentiment_inflight.pop(ticker, None)


def _sentiment_for_analysis(ticker: str) -> tuple[dict, bool]:
    now = time.time()
    with _sentiment_lock:
        cached = _sentiment_cache.get(ticker)
        if cached and now - cached["ts"] < ANALYSIS_TTL:
            return cached["result"], True
        if ticker not in _sentiment_inflight:
            future = _sentiment_executor.submit(fetch_news_sentiment, ticker)
            _sentiment_inflight[ticker] = future
            future.add_done_callback(lambda done, symbol=ticker: _finish_sentiment_fetch(symbol, done))
    return _neutral_sentiment(), False

def fetch_news_sentiment(ticker: str):
    try:
        base_ticker = ticker.split('.')[0]
        raw_name = base_ticker
        try:
            info = yf.Ticker(ticker).fast_info
            raw_name = getattr(info, "short_name", None) or raw_name
        except Exception:
            try:
                raw_name = yf.Ticker(ticker).info.get("shortName") or yf.Ticker(ticker).info.get("longName") or raw_name
            except Exception:
                pass

        # Strip generic corporate suffixes to get a clean, searchable name
        SUFFIX_PATTERN = r'\b(limited|ltd|corp|corporation|inc|plc|pvt|llc|group|holdings?|industries|services|finance|financial|company|co)\b'
        clean_name = re.sub(SUFFIX_PATTERN, '', raw_name, flags=re.IGNORECASE).strip()
        clean_name = re.sub(r'\s+', ' ', clean_name).strip()
        # Use cleaned name if meaningful, otherwise fall back to base ticker
        search_name = clean_name if len(clean_name) > 3 else base_ticker

        # Build query: specific company + news-relevant keywords, exclude data sites
        search_query = urllib.parse.quote(
            f'"{search_name}" (earnings OR results OR profit OR revenue OR growth OR '
            f'acquisition OR merger OR raises OR cuts OR dividend OR stake OR fund OR '
            f'investor OR quarter OR outlook OR guidance OR expansion) '
            f'-site:tradingview.com -site:simplywall.st -site:stockanalysis.com '
            f'-site:macrotrends.net -site:screener.in -site:trendlyne.com '
            f'-site:tickertape.in -site:meyka.com'
        )
        url = f"https://news.google.com/rss/search?q={search_query}&hl=en-IN&gl=IN&ceid=IN:en"
        fb_parts = f'({search_name} OR {base_ticker})' if search_name != base_ticker else base_ticker
        fb_q = urllib.parse.quote(
            f'{fb_parts} '
            f'-site:tradingview.com -site:simplywall.st -site:stockanalysis.com '
            f'-site:macrotrends.net -site:screener.in -site:trendlyne.com '
            f'-site:tickertape.in -site:meyka.com'
        )
        fb_url = f"https://news.google.com/rss/search?q={fb_q}&hl=en-IN&gl=IN&ceid=IN:en"
        roots = _fetch_rss_roots({"primary": url, "fallback": fb_url})
        root = roots.get("primary") or roots.get("fallback")
        items = root.findall('.//item') if root is not None else []

        headlines = []
        stories = []
        total_polarity = 0

        # Non-news publishers — data sites, auto-generated tickers, official IR pages
        GENERIC_WORDS = {'the','and','of','ltd','limited','corp','corporation','inc',
                         'plc','pvt','llc','bank','group','holdings','company','co',
                         'india','industries','services','finance','financial'}
        data_only_sources = {
            'tradingview', 'simplywall.st', 'stockanalysis', 'macrotrends',
            'wisesheets', 'tickertape', 'screener.in', 'trendlyne', 'meyka',
            'chartmill', 'finviz', 'nseindia', 'bseindia',
        }
        # Patterns that indicate data pages or auto-generated noise
        junk_patterns = [
            r'financial statements?',
            r'stock price and chart',
            r'(live |today.s )?share price',
            r'balance sheet',
            r'income statement',
            r'cash flow',
            r'historical (data|price)',
            r'(live |real.?time )(price|quote)',
            r'charting by',
            r'stock (rises?|falls?|drops?|jumps?|gains?|slides?|surges?|climbs?) \d',
            r'\d+\.?\d*% (up|down|gain|loss)',
            r'intraday[:\s]',
            r'pre.?market (margins|spotlight)',
            r'multibagger',
            r'penny stock',
            r'top stocks? to buy',
            r'price target',
            r'outlook for (the )?week',
            r'weekly outlook',
            r'technical outlook',
            r'careers?( at| -)',
            r'job (vacancy|opening|listing)',
            r'personal banking',
            r'netbanking',
            r'fasttag|fastag',
            r'privacy policy',
            r'raise (dispute|complaint)',
        ]
        # Only match if a distinctive company term appears in the title
        required_terms = {
            term.lower()
            for term in re.split(r'[^A-Za-z0-9]+', f"{search_name} {base_ticker}")
            if len(term) > 2 and term.lower() not in GENERIC_WORDS
        }
        # Add prefix abbreviations: "sbi" from SBIN, "hdfc" from HDFCBANK, "icici" from ICICIBANK
        for _n in (3, 4, 5):
            if len(base_ticker) > _n:
                required_terms.add(base_ticker[:_n].lower())

        def _title_matches(lower_title: str) -> bool:
            return any(
                re.search(r'\b' + re.escape(t) + r'\b', lower_title)
                for t in required_terms
            )

        def _is_english_title(title: str) -> bool:
            letters = re.findall(r'[^\W\d_]', title, flags=re.UNICODE)
            if not letters:
                return True
            english_letters = re.findall(r'[A-Za-z]', title)
            return len(english_letters) / len(letters) >= 0.85

        for item in items:
            title_el = item.find('title')
            if title_el is None or not title_el.text:
                continue
            link_el = item.find('link')
            raw_title = html.unescape(title_el.text).strip()
            parts = raw_title.rsplit(' - ', 1)
            clean_title = parts[0].strip()
            source = parts[1].strip() if len(parts) > 1 else "News"
            clean_lower = clean_title.lower()
            source_lower = source.lower()

            # Keep stock pages English-only, even when Google News mixes local-language results.
            if not _is_english_title(clean_title):
                continue
            # Skip data-only publishers
            if any(ds in source_lower for ds in data_only_sources):
                continue
            # Skip junk title patterns
            if any(re.search(p, clean_lower) for p in junk_patterns):
                continue
            # Skip if no distinctive company term in title
            if required_terms and not _title_matches(clean_lower):
                continue
            # Skip too-short, pipe-separated, or all-caps ticker-only titles
            if len(clean_title) < 40 or '|' in clean_title:
                continue

            display_title = f"{clean_title} — {source}"
            if display_title not in headlines:
                headlines.append(display_title)
                stories.append({
                    "title": clean_title,
                    "source": source,
                    "url": link_el.text.strip() if link_el is not None and link_el.text else None,
                })
                total_polarity += TextBlob(clean_title).sentiment.polarity
            if len(headlines) == 5:
                break

        # Fallback: broader search when primary returned fewer than 3 headlines
        if len(headlines) < 3:
            try:
                root2 = roots.get("fallback")
                if root2 is None:
                    raise ValueError("Fallback RSS was unavailable.")
                seen = set(headlines)
                for item2 in root2.findall('.//item'):
                    title_el2 = item2.find('title')
                    if title_el2 is None or not title_el2.text:
                        continue
                    link_el2 = item2.find('link')
                    raw2 = html.unescape(title_el2.text).strip()
                    parts2 = raw2.rsplit(' - ', 1)
                    ct2 = parts2[0].strip()
                    src2 = parts2[1].strip() if len(parts2) > 1 else "News"
                    lower2 = ct2.lower()
                    if not _is_english_title(ct2):
                        continue
                    if any(ds in src2.lower() for ds in data_only_sources):
                        continue
                    if any(re.search(p, lower2) for p in junk_patterns):
                        continue
                    if required_terms and not _title_matches(lower2):
                        continue
                    if len(ct2) < 35 or '|' in ct2:
                        continue
                    disp2 = f"{ct2} — {src2}"
                    if disp2 not in seen:
                        headlines.append(disp2)
                        stories.append({
                            "title": ct2,
                            "source": src2,
                            "url": link_el2.text.strip() if link_el2 is not None and link_el2.text else None,
                        })
                        seen.add(disp2)
                        total_polarity += TextBlob(ct2).sentiment.polarity
                    if len(headlines) == 5:
                        break
            except Exception:
                pass

        if not headlines:
            return {"score": 0, "label": "Neutral", "headlines": ["No recent news found for this stock."], "stories": []}
        avg_polarity = total_polarity / len(headlines)
        label = "Bullish" if avg_polarity > 0.05 else "Bearish" if avg_polarity < -0.05 else "Neutral"
        return {"score": round(avg_polarity, 2), "label": label, "headlines": headlines, "stories": stories}
    except Exception:
        return {"score": 0, "label": "Neutral", "headlines": ["Live news feed unavailable."], "stories": []}

def fetch_global_market_news():
    try:
        search_query = urllib.parse.quote('"stock market" OR Nifty OR Sensex OR Nasdaq earnings economy')
        url = f"https://news.google.com/rss/search?q={search_query}&hl=en-US&gl=US&ceid=US:en"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req, timeout=8)
        root = ET.fromstring(response.read())
        stories = []
        spam_patterns = [
            r'watch these stocks',
            r'top stocks? to buy',
            r'multibagger',
            r'penny stock',
            r'price target',
            r'buy or sell',
            r'outlook for (the )?week',
            r'weekly outlook',
            r'technical outlook',
        ]

        for item in root.findall('.//item'):
            title_element = item.find('title')
            if title_element is None or not title_element.text:
                continue
            link_element = item.find('link')
            raw_title = html.unescape(title_element.text).strip()
            parts = raw_title.rsplit(' - ', 1)
            title = parts[0].strip()
            source = parts[1].strip() if len(parts) > 1 else "Google News"
            lower = title.lower()
            if any(re.search(pattern, lower) for pattern in spam_patterns) or len(title) < 30:
                continue
            if title not in [story["title"] for story in stories]:
                stories.append({
                    "title": title,
                    "source": source,
                    "url": link_element.text.strip() if link_element is not None and link_element.text else None,
                })
            if len(stories) == 5:
                break

        return {"stories": stories or [{"title": "Global market news feed is temporarily unavailable.", "source": "Bullseye", "url": None}]}
    except Exception:
        return {"stories": [{"title": "Global market news feed is temporarily unavailable.", "source": "Bullseye", "url": None}]}

def evaluate_strategies(latest: pd.Series, prev: pd.Series, df: pd.DataFrame):
    evals = {}
    c, o, h, l, v = latest['close'], latest['open'], latest['high'], latest['low'], latest['volume']
    
    sma50, sma200 = latest['SMA_50'], latest['SMA_200']
    ema20, ema50 = latest['EMA_20'], latest['EMA_50']
    rsi = latest['RSI_14']
    macd, macd_sig = latest['MACD'], latest['MACD_signal']
    bb_u, bb_l = latest['BBU_14_2.0'], latest['BBL_14_2.0']
    vwap = latest['VWAP']
    vol_sma = latest['VOL_SMA_20']
    atr = latest['ATR_14']
    
    # 1. Moving Average Crossover
    if sma50 > sma200:
        score = min(98, 70 + ((sma50 - sma200) / sma200) * 200)
        evals[1] = {"score": int(score), "desc": f"Bullish: SMA50 ({sma50:.2f}) is actively trending above SMA200 ({sma200:.2f}). Strong macro trend."}
    else:
        evals[1] = {"score": 25, "desc": f"Bearish: SMA50 ({sma50:.2f}) remains below SMA200. Macro trend is currently negative."}

    # 2. EMA Pullback
    if ema20 > ema50 and (c < ema20 * 1.02 and c > ema20 * 0.98):
        evals[2] = {"score": 85, "desc": f"Prime Setup: Price ({c:.2f}) is pulling back perfectly to the dynamic EMA20 support ({ema20:.2f}) during an uptrend."}
    else:
        evals[2] = {"score": 45, "desc": "No clear pullback detected. Price is currently extended away from primary EMA support zones."}

    # 3. Supertrend (Approximated)
    if c > ema50 and macd > macd_sig:
        evals[3] = {"score": 78, "desc": "Trend Continuation: Price holds high ground while MACD confirms underlying buyer momentum."}
    else:
        evals[3] = {"score": 35, "desc": "Noise/Chop: Supertrend logic invalid as price and momentum are showing conflicting signals."}

    # 4. Breakout Trading
    high_20 = df['high'].tail(20).max()
    if c >= high_20 * 0.98 and v > vol_sma:
        evals[4] = {"score": 92, "desc": f"Heavy Breakout: Price is pressing 20-day highs ({high_20:.2f}) backed by abnormal volume expansion."}
    else:
        evals[4] = {"score": 40, "desc": f"Consolidating: Price is trapped inside the range. Resistance at {high_20:.2f} holds."}

    # 5. Trendline Breakout + Retest
    if prev['close'] > sma50 and c <= sma50 * 1.01 and c >= sma50:
        evals[5] = {"score": 88, "desc": f"Retest Confirmed: Price broke out and is now successfully retesting the SMA50 ({sma50:.2f}) as new support."}
    else:
        evals[5] = {"score": 30, "desc": "Structure invalid. Price is not currently testing a structural breakout boundary."}

    # 6. Volume Anomaly
    vol_ratio = v / vol_sma if vol_sma > 0 else 1
    if vol_ratio > 1.5:
        evals[6] = {"score": 95, "desc": f"Whale Activity: Current volume is {vol_ratio:.1f}x the 20-day average. Massive institutional footprint."}
    else:
        evals[6] = {"score": 20, "desc": "Retail Volume: Trading volume is strictly average. No institutional anomalies detected."}

    # 7. Relative Strength
    if rsi > 60 and rsi < 75:
        evals[7] = {"score": 82, "desc": f"Leader: RSI is highly elevated at {rsi:.1f}, indicating this asset is outperforming the broader market."}
    else:
        evals[7] = {"score": 45, "desc": f"Laggard: Relative strength is neutral/weak (RSI: {rsi:.1f}). Capital is flowing elsewhere."}

    # 8. Momentum Ignition
    if (c - o) / o > 0.02 and v > vol_sma * 1.2:
        evals[8] = {"score": 90, "desc": "Ignition Phase: Price is accelerating with rising volume and expanding volatility. Breakout imminent."}
    else:
        evals[8] = {"score": 30, "desc": "Low Momentum: Price action is sluggish with contracting volatility metrics."}

    # 9. VWAP Trend
    if c > vwap:
        evals[9] = {"score": 75, "desc": f"Institutional Control: Price ({c:.2f}) is holding strictly above the Volume Weighted Average Price ({vwap:.2f})."}
    else:
        evals[9] = {"score": 25, "desc": f"Suppression: Sellers are actively defending the VWAP level ({vwap:.2f}). Institutional offloading."}

    # 10. Gap-Up Momentum
    if o > prev['close'] * 1.01:
        evals[10] = {"score": 85, "desc": "Gap Confirmed: Asset opened significantly higher than previous close, signaling overnight accumulation."}
    else:
        evals[10] = {"score": 15, "desc": "Flat Open: No gap momentum detected in current session structure."}

    # 11. RSI Divergence
    if c > prev['close'] and rsi < df.iloc[-2]['RSI_14']:
        evals[11] = {"score": 88, "desc": f"Warning: Price made a higher high, but RSI dropped to {rsi:.1f}. Bearish divergence forming."}
    else:
        evals[11] = {"score": 40, "desc": "Momentum is aligned with price action. No structural divergence present."}

    # 12. MACD Divergence
    macd_hist = macd - macd_sig
    if c > prev['close'] and macd_hist < df.iloc[-2]['MACD'] - df.iloc[-2]['MACD_signal']:
        evals[12] = {"score": 85, "desc": "Reversal Alert: MACD histogram is compressing while price climbs. Momentum is exhausted."}
    else:
        evals[12] = {"score": 35, "desc": "MACD flow matches price trajectory. Trend remains structurally intact."}

    # 13. Mean Reversion
    dist_sma200 = (c - sma200) / sma200
    if abs(dist_sma200) > 0.15:
        evals[13] = {"score": 90, "desc": f"Extreme Deviation: Price is {abs(dist_sma200)*100:.1f}% extended from the 200 SMA. Rubber-band snapback likely."}
    else:
        evals[13] = {"score": 20, "desc": "Price is trading comfortably near statistical means. No reversion setup."}

    # 14. Bollinger Band Reversal
    if c < bb_l:
        evals[14] = {"score": 92, "desc": f"Oversold: Price pierced the lower Bollinger Band ({bb_l:.2f}). High probability of mean-reversion bounce."}
    elif c > bb_u:
        evals[14] = {"score": 92, "desc": f"Overbought: Price pierced the upper Bollinger Band ({bb_u:.2f}). Asset is mathematically stretched."}
    else:
        evals[14] = {"score": 25, "desc": "Price is contained perfectly within standard deviation bands."}

    # 15. Volatility Expansion
    bb_width = bb_u - bb_l
    prev_bb_width = df.iloc[-5]['BBU_14_2.0'] - df.iloc[-5]['BBL_14_2.0']
    if bb_width > prev_bb_width * 1.3:
        evals[15] = {"score": 88, "desc": "Expansion: Volatility bands are violently widening, indicating the start of a massive directional move."}
    else:
        evals[15] = {"score": 30, "desc": "Squeeze: Volatility is currently contracting and stabilizing."}

    # 16. ATR Breakout
    if (h - l) > atr * 1.5:
        evals[16] = {"score": 85, "desc": f"Explosive Range: Current candle spread exceeds 1.5x the Average True Range ({atr:.2f}). Stop-loss hunt in progress."}
    else:
        evals[16] = {"score": 35, "desc": "Current trading range is well within normal historical ATR limits."}

    # 17. Liquidity Sweep
    lower_wick = min(o, c) - l
    body = abs(c - o)
    if lower_wick > body * 2 and c > prev['low']:
        evals[17] = {"score": 95, "desc": "Stop Hunt: Market aggressively swept recent lows for liquidity before snapping back up."}
    else:
        evals[17] = {"score": 20, "desc": "Clean price action. No institutional liquidity sweeps or stop-hunts detected on this timeframe."}

    # 18. Order Block
    if body < (h - l) * 0.3 and v > vol_sma * 1.2:
        evals[18] = {"score": 88, "desc": "Accumulation Zone: Heavy volume on a narrow price spread indicates smart money building a massive position."}
    else:
        evals[18] = {"score": 30, "desc": "Retail flow dominates. No clear institutional footprint or order blocks generated."}

    # 19. Support/Resistance Flip
    if prev['close'] < sma200 and c > sma200 and v > vol_sma:
        evals[19] = {"score": 92, "desc": "S/R Flip: Price shattered the 200 SMA resistance with volume. Old resistance is now structural support."}
    else:
        evals[19] = {"score": 25, "desc": "No major historical zones flipped in the current session."}

    # 20. Multi-Factor AI Strategy
    fiso_base = (evals[1]['score'] + evals[6]['score'] + evals[7]['score'] + evals[9]['score']) / 4
    evals[20] = {"score": int(fiso_base), "desc": f"Quant Matrix: Synthesizing Trend, Volume, VWAP, and RSI yields a multi-factor confidence of {int(fiso_base)}/100."}

    best_id = max(evals.items(), key=lambda x: x[1]['score'])[0]
    return evals, best_id

def run_analysis(df: pd.DataFrame, ticker: str):
    # ── RAM cache check ────────────────────────────────────────────────────────
    now = time.time()
    if ticker in _analysis_cache and now - _analysis_cache[ticker]['ts'] < ANALYSIS_TTL:
        return _analysis_cache[ticker]['result']

    # ── Supabase cache check ───────────────────────────────────────────────────
    # Sources that indicate stale/low-quality cached news — bust the cache if found
    _STALE_NEWS_SOURCES = {'meyka', 'tradingview', 'simplywall.st', 'stockanalysis', 'macrotrends'}

    if _SUPABASE_OK and _sb:
        try:
            import json as _json
            cached = _sb.table("analysis_cache").select("result,updated_at").eq("ticker", ticker).execute()
            if cached.data:
                row = cached.data[0]
                updated = datetime.fromisoformat(row['updated_at'].replace('Z', '+00:00'))
                age = (datetime.now(updated.tzinfo) - updated).total_seconds()
                if age < ANALYSIS_TTL:
                    result = _json.loads(row['result']) if isinstance(row['result'], str) else row['result']
                    # Invalidate if cached news contains blocked low-quality sources
                    headlines = result.get('sentiment', {}).get('headlines', [])
                    has_stale_news = any(
                        any(src in h.lower() for src in _STALE_NEWS_SOURCES)
                        for h in headlines
                    )
                    if not has_stale_news:
                        _analysis_cache[ticker] = {'result': result, 'ts': time.time()}
                        print(f"[Cache] Analysis Supabase hit for {ticker}")
                        return result
                    print(f"[Cache] Stale news detected for {ticker}, re-running analysis")
        except Exception as e:
            print(f"[Cache] Analysis Supabase read failed: {e}")
    df = df.dropna(subset=['close', 'high', 'low', 'volume'])
    df = df.reset_index(drop=True)

    close, high, low, volume = df['close'], df['high'], df['low'], df['volume']

    # Indicators needed for 20 strategies
    df['SMA_50']  = ta.trend.sma_indicator(close, window=50)
    df['SMA_200'] = ta.trend.sma_indicator(close, window=200)
    df['EMA_20']  = ta.trend.ema_indicator(close, window=20)
    df['EMA_50']  = ta.trend.ema_indicator(close, window=50)
    df['RSI_14']  = ta.momentum.rsi(close, window=14)
    df['MACD']    = ta.trend.macd(close)
    df['MACD_signal'] = ta.trend.macd_signal(close)
    df['ATR_14']  = ta.volatility.average_true_range(high, low, close, window=14)
    df['ADX_14']  = ta.trend.adx(high, low, close, window=14)
    df['BBU_14_2.0'] = ta.volatility.bollinger_hband(close, window=14, window_dev=2)
    df['BBL_14_2.0'] = ta.volatility.bollinger_lband(close, window=14, window_dev=2)
    df['VWAP'] = ta.volume.volume_weighted_average_price(high, low, close, volume, window=14)
    df['VOL_SMA_20'] = volume.rolling(window=20).mean()
    df['RET_5'] = close.pct_change(5)
    df['RET_20'] = close.pct_change(20)
    df['RANGE_PCT'] = (high - low) / close
    df['RESISTANCE_20'] = high.rolling(20).max().shift(1)
    df['SUPPORT_20'] = low.rolling(20).min().shift(1)

    df = df.dropna()
    if len(df) < 5: return {"error": "Insufficient historical data."}

    latest = df.iloc[-1]
    prev = df.iloc[-2]
    sentiment, sentiment_ready = _sentiment_for_analysis(ticker)

    # Legacy FISO components are retained as a diagnostic score only.
    sma_diff_pct = (latest['SMA_50'] - latest['SMA_200']) / latest['SMA_200']
    trend_score = max(0.0, min(35.0, 17.5 + (sma_diff_pct * 250))) 
    
    rsi = latest['RSI_14']
    if rsi < 30: momentum_score = 35.0 
    elif rsi > 70: momentum_score = 5.0 
    else: momentum_score = max(0.0, min(35.0, 35.0 - ((rsi - 30) * 0.75)))
    
    macd_hist = latest['MACD'] - latest['MACD_signal']
    macd_score = max(0.0, min(30.0, 15.0 + (macd_hist / latest['close'] * 1500)))

    raw_fiso = trend_score + momentum_score + macd_score + (sentiment['score'] * 20.0)
    fiso = min(100.0, max(0.0, raw_fiso))

    live_latest = {
        "close": float(latest["close"]),
        "high": float(latest["high"]),
        "low": float(latest["low"]),
        "volume": float(latest["volume"]),
        "ema20": float(latest["EMA_20"]),
        "ema50": float(latest["EMA_50"]),
        "rsi14": float(latest["RSI_14"]),
        "adx14": float(latest["ADX_14"]),
        "atr14": float(latest["ATR_14"]),
        "vol_avg20": float(latest["VOL_SMA_20"]),
        "resistance20": float(latest["RESISTANCE_20"]),
        "support20": float(latest["SUPPORT_20"]),
        "ret5": float(latest["RET_5"]),
        "ret20": float(latest["RET_20"]),
        "range_pct": float(latest["RANGE_PCT"]),
    }
    relative_strength = float(latest["RET_20"] * 100)
    regime = {"label": "neutral", "alignment_buy": 0.55, "alignment_sell": 0.55, "score": 0.55}
    technical_setup = evaluate_technical_setup(live_latest, relative_strength, 0.0)
    feature_values = build_live_feature_values(
        live_latest,
        technical_setup,
        regime,
        relative_strength=relative_strength,
        sector_strength=0.0,
    )
    probabilities = predict_signal_probabilities(
        technical_setup,
        regime,
        "Balanced",
        relative_strength,
        technical_setup["chart_setup_quality"],
        feature_values=feature_values,
        setup_type=technical_setup.get("setup_type"),
    )
    model_pwin = float(probabilities["calibrated_pwin"])
    model_expected_r = float(probabilities.get("expected_return") or 0.0)
    direction = technical_setup["direction"]
    if direction == "BUY":
        verdict = "Strong Buy" if model_pwin >= 0.70 else "Buy" if model_pwin >= 0.55 else "Hold" if model_pwin >= 0.45 else "Sell"
    else:
        verdict = "Strong Sell" if model_pwin >= 0.70 else "Sell" if model_pwin >= 0.55 else "Hold" if model_pwin >= 0.45 else "Buy"

    atr_val = float(latest['ATR_14'])
    entry = float(latest['close'])
    
    stop_distance = 1.5 * atr_val
    forecast_r = max(0.35, min(abs(model_expected_r), 3.0))
    if direction == "BUY": 
        stop_loss = entry - (1.5 * atr_val)
        target = entry + (forecast_r * stop_distance) 
    else: 
        stop_loss = entry + (1.5 * atr_val)
        target = entry - (forecast_r * stop_distance)

    momentum_velocity = 1.0 + (abs(rsi - 50) / 50.0) 
    estimated_days = max(1, min(math.ceil((abs(target - entry) / atr_val) / momentum_velocity * 1.4), 21)) 
    
    confidence = float(probabilities["confidence"]) * 100

    strategy_evals, best_id = evaluate_strategies(latest, prev, df)

    result = {
        "ticker": ticker,
        "fiso_score": round(fiso, 2),
        "verdict": verdict,
        "entry": round(entry, 2),
        "stop_loss": round(stop_loss, 2),
        "target": round(target, 2),
        "current_price": round(float(latest['close']), 2),
        "sentiment": sentiment,
        "strategy_evals": strategy_evals,
        "best_strategy_id": best_id,
        "confidence": round(confidence, 2),
        "model_probability": round(model_pwin, 4),
        "model_expected_return_r": round(model_expected_r, 4),
        "model_path": probabilities.get("model_path", "fallback"),
        "historical_hit_rate": probabilities.get("historical_hit_rate"),
        "historical_hit_rate_trades": probabilities.get("historical_hit_rate_trades"),
        "estimated_days": estimated_days,
        "target_date": (datetime.now() + timedelta(days=(estimated_days * 1.4))).strftime('%b %d, %Y')
    }

    # ── Save to RAM cache ──────────────────────────────────────────────────────
    if sentiment_ready:
        _analysis_cache[ticker] = {'result': result, 'ts': time.time()}

    # ── Save to Supabase cache ─────────────────────────────────────────────────
    if sentiment_ready and _SUPABASE_OK and _sb and _SUPABASE_WRITES_OK:
        try:
            import json as _json
            _sb.table("analysis_cache").upsert({
                "ticker":     ticker,
                "result":     _json.dumps(result),
                "updated_at": datetime.utcnow().isoformat() + "Z"
            }, on_conflict="ticker").execute()
        except Exception as e:
            print(f"[Cache] Analysis Supabase save failed: {e}")
    if not sentiment_ready:
        print(f"[News] Returning {ticker} analysis with neutral sentiment while news cache warms.")

    return result
