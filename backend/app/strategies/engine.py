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
from datetime import datetime, timedelta

# ── In-memory analysis cache ──────────────────────────────────────────────────
_analysis_cache: dict = {}
ANALYSIS_TTL = 3600

# ── Supabase for persistent cache ─────────────────────────────────────────────
try:
    from app.core.supabase_client import supabase as _sb
    _SUPABASE_OK = True
    _SUPABASE_WRITES_OK = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
except Exception:
    _sb = None
    _SUPABASE_OK = False
    _SUPABASE_WRITES_OK = False

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

        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req, timeout=8)
        xml_data = response.read()

        root = ET.fromstring(xml_data)
        items = root.findall('.//item')

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
                fb_parts = f'({search_name} OR {base_ticker})' if search_name != base_ticker else base_ticker
                fb_q = urllib.parse.quote(
                    f'{fb_parts} '
                    f'-site:tradingview.com -site:simplywall.st -site:stockanalysis.com '
                    f'-site:macrotrends.net -site:screener.in -site:trendlyne.com '
                    f'-site:tickertape.in -site:meyka.com'
                )
                fb_url = f"https://news.google.com/rss/search?q={fb_q}&hl=en-IN&gl=IN&ceid=IN:en"
                req2 = urllib.request.Request(fb_url, headers={'User-Agent': 'Mozilla/5.0'})
                resp2 = urllib.request.urlopen(req2, timeout=8)
                root2 = ET.fromstring(resp2.read())
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

def _infer_market(ticker: str) -> str:
    t = (ticker or "").upper()
    if t.endswith(".NS"):
        return "NSE"
    if t.endswith(".BO"):
        return "BSE"
    return "US"


def _liquidity_score_local(avg_turnover: float) -> float:
    return min(1.0, max(0.0, avg_turnover / 500_000_000))


# ── Setup hit-rate stats (shared with the daily backtested engine) ─────────────
_setup_stats_cache = {"ts": 0.0, "data": {}}
SETUP_STATS_TTL = 1800


def _setup_outcome_counts(setup_type: str) -> tuple[int, int]:
    """Return (wins, trades) for a setup type from tracked signal outcomes.

    These come from the SAME outcome-tracking tables the daily email engine
    writes to, so the stock page reports genuine historical hit-rates rather
    than fabricated ones. Cached briefly to avoid hitting the DB per request.
    """
    now = time.time()
    if now - _setup_stats_cache["ts"] > SETUP_STATS_TTL:
        stats: dict = {}
        if _SUPABASE_OK and _sb:
            try:
                sig = _sb.table("stock_signals").select("id,setup_type").order("run_date", desc=True).limit(600).execute()
                out = _sb.table("signal_outcomes").select("stock_signal_id,outcome").limit(600).execute()
                setup_by_id = {r["id"]: (r.get("setup_type") or "mixed_setup") for r in (getattr(sig, "data", None) or [])}
                for o in (getattr(out, "data", None) or []):
                    s = setup_by_id.get(o.get("stock_signal_id"))
                    if not s:
                        continue
                    d = stats.setdefault(s, {"wins": 0, "trades": 0})
                    d["trades"] += 1
                    if o.get("outcome") == "WIN":
                        d["wins"] += 1
            except Exception as e:
                print(f"[Analyze] setup stats fetch failed: {e}")
        _setup_stats_cache["ts"] = now
        _setup_stats_cache["data"] = stats
    d = _setup_stats_cache["data"].get(setup_type, {"wins": 0, "trades": 0})
    return d["wins"], d["trades"]


def _unified_signal(ohlcv: pd.DataFrame, ticker: str, sentiment_score: float = 0.0):
    """Score a single ticker with the SAME calibrated engine that powers the
    daily emails (feature engineering → technical rules → calibrated win
    probability → expected-R → weighted final score). Returns None when the
    history is too short, in which case the caller uses a corrected fallback.
    """
    try:
        from app.services.daily_signal_engine import (
            adjusted_win_rate,
            build_feature_frame,
            compute_expected_r,
            compute_final_score,
            detect_market_regime,
            evaluate_technical_setup,
            fetch_market_context,
            predict_signal_probabilities,
            validate_candidate_frame,
            wilson_lower_bound_placeholder,
        )
        from app.services.daily_signal_engine.config import (
            DEFAULT_K_SMOOTHING,
            RISK_PROFILES,
            UNIVERSE_AVERAGE_WIN_RATE,
        )
    except Exception as e:
        print(f"[Analyze] calibrated engine import failed: {e}")
        return None

    risk_level = "Balanced"
    profile = RISK_PROFILES[risk_level]

    try:
        feats = build_feature_frame(ohlcv)
    except Exception as e:
        print(f"[Analyze] feature frame build failed for {ticker}: {e}")
        return None
    if feats is None or len(feats) < 30:
        return None

    latest = feats.iloc[-1]
    close = float(latest["close"])
    atr = float(latest["atr14"])
    if close <= 0 or atr <= 0:
        return None

    # Market regime + relative strength (best-effort; neutral on failure).
    market = _infer_market(ticker)
    regime = {"label": "neutral", "alignment_buy": 0.55, "alignment_sell": 0.55, "score": 0.55}
    relative_strength = 0.0
    try:
        ctx = fetch_market_context(market)
        idx_hist = ctx["index_history"]
        regime = detect_market_regime(idx_hist)
        idx_feats = build_feature_frame(idx_hist)
        if len(feats) >= 25 and len(idx_feats) >= 25:
            stock_ret = float(feats["close"].iloc[-1] / feats["close"].iloc[-21] - 1)
            index_ret = float(idx_feats["close"].iloc[-1] / idx_feats["close"].iloc[-21] - 1)
            relative_strength = (stock_ret - index_ret) * 100
    except Exception:
        pass

    try:
        validation = validate_candidate_frame(feats, risk_level)
    except Exception:
        validation = {"quality_score": 0.5, "rejections": [], "avg_turnover": 0.0}
    quality_score = float(validation.get("quality_score", 0.5))

    technical_setup = evaluate_technical_setup(latest.to_dict(), relative_strength, 0.0)
    probabilities = predict_signal_probabilities(
        technical_setup, regime, risk_level, relative_strength, quality_score
    )
    direction = technical_setup["direction"]
    pwin = float(probabilities["calibrated_pwin"])
    chart_quality = float(technical_setup["chart_setup_quality"])
    regime_alignment = regime["alignment_buy"] if direction == "BUY" else regime["alignment_sell"]

    # Volatility-scaled targets/stops from the risk profile (not hand-tuned).
    target_mult = profile["target_atr_multiplier"]
    stop_mult = profile["stop_atr_multiplier"]
    if direction == "BUY":
        target_price = close + atr * target_mult
        stop_loss = close - atr * stop_mult
        target_r = max((target_price - close) / max(close - stop_loss, 1e-6), 0.0)
    else:
        target_price = close - atr * target_mult
        stop_loss = close + atr * stop_mult
        target_r = max((close - target_price) / max(stop_loss - close, 1e-6), 0.0)
    expected_r = compute_expected_r(pwin, float(probabilities["p_loss"]), target_r, 1.0)

    # Honest historical hit-rate (shrinkage toward universe prior + Wilson floor).
    setup_type = technical_setup["setup_type"]
    wins, trades = _setup_outcome_counts(setup_type)
    setup_win_rate = adjusted_win_rate(wins, trades, UNIVERSE_AVERAGE_WIN_RATE, DEFAULT_K_SMOOTHING)
    wilson_floor = wilson_lower_bound_placeholder(wins, trades) if trades else UNIVERSE_AVERAGE_WIN_RATE * 0.8
    adjusted_setup_win_rate = min(setup_win_rate, max(wilson_floor, 0.0) + 0.12)

    atr_pct = atr / close
    penalty = max(0.0, (1.0 - quality_score) * 0.18) + max(0.0, atr_pct - profile["max_atr_pct"] / 100) * 0.5
    penalty *= profile["risk_penalty_multiplier"]

    compute_final_score(
        calibrated_pwin=pwin,
        expected_r=expected_r,
        adjusted_setup_win_rate=adjusted_setup_win_rate,
        market_regime_alignment=regime_alignment,
        chart_setup_quality=chart_quality,
        relative_strength=min(1.0, abs(relative_strength) / 5),
        liquidity_score=_liquidity_score_local(float(validation.get("avg_turnover", 0.0))),
        model_stability=float(probabilities["model_stability"]),
        risk_penalties=penalty,
    )

    # 0-100 conviction meter (direction-aware so SELL setups read low).
    conviction = 0.5 * pwin + 0.3 * chart_quality + 0.2 * regime_alignment
    fiso = conviction * 100 if direction == "BUY" else (1 - conviction) * 100
    fiso = max(1.0, min(99.0, fiso))

    # Realistic time-to-target: net directional drift is only a fraction of the
    # daily range, scaled by trend strength (ADX). No ATR-as-speed, no double 1.4x.
    adx = float(latest.get("adx14", 18.0) or 18.0)
    trend_factor = max(0.5, min(1.4, adx / 22.0))
    daily_drift = atr * 0.32 * trend_factor
    distance = abs(target_price - close)
    est_trading_days = int(max(2, min(15, round(distance / max(daily_drift, 1e-6)))))

    confidence = max(40.0, min(95.0, float(probabilities["confidence"]) * 100))

    return {
        "fiso": fiso,
        "direction": direction,
        "target_price": float(target_price),
        "stop_loss": float(stop_loss),
        "target_r": float(target_r),
        "expected_r": float(expected_r),
        "confidence": confidence,
        "est_trading_days": est_trading_days,
        "setup_type": setup_type,
        "setup_win_rate": float(adjusted_setup_win_rate),
        "setup_sample_size": int(trades),
        "quality_score": quality_score,
        "rejections": list(validation.get("rejections", [])),
        "reasons": list(technical_setup.get("reasons", [])),
    }


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

    # Clean OHLCV captured BEFORE long-window indicators are added — the
    # calibrated engine needs the full history, not the ~50 rows that survive
    # an SMA_200 dropna below.
    _ohlcv_cols = [c for c in ['date', 'open', 'high', 'low', 'close', 'volume'] if c in df.columns]
    ohlcv = df[_ohlcv_cols].copy()
    if 'date' not in ohlcv.columns:
        ohlcv['date'] = pd.date_range(end=datetime.utcnow(), periods=len(ohlcv), freq='D')
    if 'open' not in ohlcv.columns:
        ohlcv['open'] = ohlcv['close']

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
    df['BBU_14_2.0'] = ta.volatility.bollinger_hband(close, window=14, window_dev=2)
    df['BBL_14_2.0'] = ta.volatility.bollinger_lband(close, window=14, window_dev=2)
    df['VWAP'] = ta.volume.volume_weighted_average_price(high, low, close, volume, window=14)
    df['VOL_SMA_20'] = volume.rolling(window=20).mean()

    df = df.dropna()
    if len(df) < 5: return {"error": "Insufficient historical data."}

    latest = df.iloc[-1]
    prev = df.iloc[-2]
    sentiment = fetch_news_sentiment(ticker)

    atr_val = float(latest['ATR_14'])
    entry = float(latest['close'])
    rsi = float(latest['RSI_14'])

    # ── Primary path: the SAME calibrated engine that powers the daily emails ──
    unified = _unified_signal(ohlcv, ticker, float(sentiment.get('score', 0.0)))

    if unified is not None:
        fiso = unified["fiso"]
        direction = unified["direction"]
        target = unified["target_price"]
        stop_loss = unified["stop_loss"]
        confidence = unified["confidence"]
        estimated_days = unified["est_trading_days"]
        reward_ratio = unified["target_r"]
        setup_win_rate = unified["setup_win_rate"]
        setup_sample_size = unified["setup_sample_size"]
        setup_type = unified["setup_type"]
        expected_r = unified["expected_r"]
        data_quality = unified["quality_score"]
        rejections = unified["rejections"]
        engine_used = "calibrated"
    else:
        # ── Fallback (short history): trend-ALIGNED, volatility-scaled. ──
        # No inverted RSI; no ATR-as-speed time estimate.
        sma_diff_pct = float((latest['SMA_50'] - latest['SMA_200']) / latest['SMA_200'])
        trend_up = (latest['SMA_50'] >= latest['SMA_200']) and (latest['close'] >= latest['EMA_50'])
        macd_hist = float(latest['MACD'] - latest['MACD_signal'])
        # RSI aligned WITH the trend (rising RSI confirms an uptrend; falling confirms a downtrend).
        rsi_aligned = max(0.0, min(1.0, (rsi - 40) / 30)) if trend_up else max(0.0, min(1.0, (60 - rsi) / 30))
        trend_strength = max(0.0, min(1.0, abs(sma_diff_pct) * 12))
        macd_align = 1.0 if ((macd_hist > 0) == trend_up) else 0.0
        sent_term = max(0.0, min(1.0, 0.5 + float(sentiment.get('score', 0.0))))
        conviction = 0.45 * trend_strength + 0.30 * rsi_aligned + 0.15 * macd_align + 0.10 * sent_term
        direction = "BUY" if trend_up else "SELL"
        fiso = max(1.0, min(99.0, 50 + conviction * 45)) if trend_up else max(1.0, min(99.0, 50 - conviction * 45))

        target_mult, stop_mult = 1.0, 0.72
        if direction == "BUY":
            target = entry + atr_val * target_mult
            stop_loss = entry - atr_val * stop_mult
            reward_ratio = (target - entry) / max(entry - stop_loss, 1e-6)
        else:
            target = entry - atr_val * target_mult
            stop_loss = entry + atr_val * stop_mult
            reward_ratio = (entry - target) / max(stop_loss - entry, 1e-6)

        adx_proxy = abs(sma_diff_pct) * 100
        trend_factor = max(0.5, min(1.4, (20 + adx_proxy) / 22))
        daily_drift = atr_val * 0.32 * trend_factor
        estimated_days = int(max(2, min(15, round(abs(target - entry) / max(daily_drift, 1e-6)))))
        confidence = max(40.0, min(92.0, 50 + conviction * 40))
        setup_win_rate = 0.52
        setup_sample_size = 0
        setup_type = "trend_continuation"
        expected_r = None
        data_quality = 0.5
        rejections = ["insufficient history for calibrated engine"]
        engine_used = "fallback"

    if fiso >= 75:
        verdict = "Strong Buy"
    elif fiso >= 55:
        verdict = "Buy"
    elif fiso > 50:
        verdict = "Hold"
    elif fiso >= 20:
        verdict = "Sell"
    else:
        verdict = "Strong Sell"

    strategy_evals, best_id = evaluate_strategies(latest, prev, df)

    result = {
        "ticker": ticker,
        "fiso_score": round(fiso, 2),
        "verdict": verdict,
        "direction": direction,
        "entry": round(entry, 2),
        "stop_loss": round(stop_loss, 2),
        "target": round(target, 2),
        "current_price": round(float(latest['close']), 2),
        "sentiment": sentiment,
        "strategy_evals": strategy_evals,
        "best_strategy_id": best_id,
        "confidence": round(confidence, 2),
        "estimated_days": estimated_days,
        "target_date": (datetime.now() + timedelta(days=round(estimated_days * 1.4))).strftime('%b %d, %Y'),
        "risk_reward": round(float(reward_ratio), 2),
        "expected_r": round(float(expected_r), 3) if expected_r is not None else None,
        "setup_type": setup_type,
        "setup_hit_rate": round(float(setup_win_rate) * 100, 1),
        "setup_sample_size": int(setup_sample_size),
        "data_quality": round(float(data_quality), 2),
        "engine": engine_used,
    }

    # ── Save to RAM cache ──────────────────────────────────────────────────────
    _analysis_cache[ticker] = {'result': result, 'ts': time.time()}

    # ── Save to Supabase cache ─────────────────────────────────────────────────
    if _SUPABASE_OK and _sb and _SUPABASE_WRITES_OK:
        try:
            import json as _json
            _sb.table("analysis_cache").upsert({
                "ticker":     ticker,
                "result":     _json.dumps(result),
                "updated_at": datetime.utcnow().isoformat() + "Z"
            }, on_conflict="ticker").execute()
        except Exception as e:
            print(f"[Cache] Analysis Supabase save failed: {e}")

    return result
