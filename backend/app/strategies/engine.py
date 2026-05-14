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
from datetime import datetime, timedelta

def fetch_news_sentiment(ticker: str):
    try:
        base_ticker = ticker.split('.')[0]
        search_query = urllib.parse.quote(f"{base_ticker} stock market news")
        url = f"https://news.google.com/rss/search?q={search_query}&hl=en-US&gl=US&ceid=US:en"
        
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req)
        xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        items = root.findall('.//item')
        
        headlines = []
        total_polarity = 0
        spam_patterns = [r'share latest news', r'share news today', r'buy or sell', r'target price']
        
        for item in items:
            title_element = item.find('title')
            if title_element is not None and title_element.text:
                clean_title = html.unescape(title_element.text).rsplit(' - ', 1)[0].strip()
                if '|' in clean_title or any(re.search(p, clean_title.lower()) for p in spam_patterns):
                    continue
                if clean_title not in headlines:
                    headlines.append(clean_title)
                    total_polarity += TextBlob(clean_title).sentiment.polarity
            if len(headlines) == 5: break
                
        if not headlines: return {"score": 0, "label": "Neutral", "headlines": ["No verified news detected."]}
        avg_polarity = total_polarity / len(headlines)
        label = "Bullish" if avg_polarity > 0.05 else "Bearish" if avg_polarity < -0.05 else "Neutral"
        return {"score": round(avg_polarity, 2), "label": label, "headlines": headlines}
    except Exception:
        return {"score": 0, "label": "Neutral", "headlines": ["Live news feed unavailable."]}

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
    df.columns = [str(c).lower() for c in df.columns]
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
    df['BBU_14_2.0'] = ta.volatility.bollinger_hband(close, window=14, window_dev=2)
    df['BBL_14_2.0'] = ta.volatility.bollinger_lband(close, window=14, window_dev=2)
    df['VWAP'] = ta.volume.volume_weighted_average_price(high, low, close, volume, window=14)
    df['VOL_SMA_20'] = volume.rolling(window=20).mean()

    df = df.dropna()
    if len(df) < 5: return {"error": "Insufficient historical data."}

    latest = df.iloc[-1]
    prev = df.iloc[-2]
    sentiment = fetch_news_sentiment(ticker)

    # Core FISO Score
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

    if fiso >= 75: verdict = "Strong Buy"
    elif fiso >= 55: verdict = "Buy"
    elif fiso >= 40: verdict = "Hold"
    elif fiso >= 20: verdict = "Sell"
    else: verdict = "Strong Sell"

    atr_val = float(latest['ATR_14'])
    entry = float(latest['close'])
    
    fiso_strength = abs(fiso - 50) / 50.0  
    reward_ratio = 1.5 + (fiso_strength * 2.0) 

    if fiso >= 50: 
        stop_loss = entry - (1.5 * atr_val)
        target = entry + (reward_ratio * atr_val) 
    else: 
        stop_loss = entry + (1.5 * atr_val)
        target = entry - (reward_ratio * atr_val)

    momentum_velocity = 1.0 + (abs(rsi - 50) / 50.0) 
    estimated_days = max(1, min(math.ceil((abs(target - entry) / atr_val) / momentum_velocity * 1.4), 21)) 
    
    confidence = min(99.4, max(42.1, 45 + abs(fiso - 50) * 0.9 + (rsi / 100) * 12))

    strategy_evals, best_id = evaluate_strategies(latest, prev, df)

    return {
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
        "estimated_days": estimated_days,
        "target_date": (datetime.now() + timedelta(days=(estimated_days * 1.4))).strftime('%b %d, %Y')
    }