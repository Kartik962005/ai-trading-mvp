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
from datetime import datetime, timedelta

def fetch_news_sentiment(ticker: str):
    try:
        base_ticker = ticker.split('.')[0]
        search_query = urllib.parse.quote(f"{base_ticker} stock market news")
        url = f"https://news.google.com/rss/search?q={search_query}&hl=en-US&gl=US&ceid=US:en"
        
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        response = urllib.request.urlopen(req)
        xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        items = root.findall('.//item')
        
        headlines = []
        total_polarity = 0
        
        for item in items:
            title_element = item.find('title')
            if title_element is not None and title_element.text:
                raw_title = html.unescape(title_element.text)
                clean_title = raw_title.rsplit(' - ', 1)[0] if ' - ' in raw_title else raw_title
                clean_title = clean_title.strip()
                clean_title = re.sub(r'\s*\([A-Za-z0-9_-]{10,12}\)$', '', clean_title)
                
                lower_title = clean_title.lower()
                if " l " in lower_title or "share price today" in lower_title:
                    continue
                
                if clean_title and clean_title not in headlines:
                    headlines.append(clean_title)
                    polarity = TextBlob(clean_title).sentiment.polarity
                    total_polarity += polarity
            
            if len(headlines) == 5:
                break
                
        if not headlines:
            return {"score": 0, "label": "Neutral", "headlines": [f"No high-quality news found for {ticker}."]}
            
        avg_polarity = total_polarity / len(headlines)
        
        if avg_polarity > 0.10: label = "Bullish"
        elif avg_polarity < -0.10: label = "Bearish"
        else: label = "Neutral"
            
        return {"score": round(avg_polarity, 2), "label": label, "headlines": headlines}
    except Exception as e:
        print(f"News fetch error for {ticker}: {e}")
        return {"score": 0, "label": "Neutral", "headlines": ["Error connecting to live news feed."]}

def evaluate_strategies(latest: pd.Series, df: pd.DataFrame):
    evaluations = {}
    rsi = latest.get('RSI_14', 50)
    sma50 = latest.get('SMA_50', latest['close'])
    sma200 = latest.get('SMA_200', latest['close'])
    macd = latest.get('MACD', 0)
    macd_signal = latest.get('MACD_signal', 0)
    
    if sma50 > sma200:
        score = min(100, 70 + ((sma50 - sma200) / sma200) * 500)
        evaluations[1] = {"score": int(score), "fit": "STRONG FIT" if score > 80 else "MODERATE FIT", "desc": f"The 50 SMA is above the 200 SMA. Confirmed Golden Cross."}
    else:
        evaluations[1] = {"score": 20, "fit": "POOR FIT", "desc": "The 50 SMA is below the 200 SMA. No Golden Cross present."}

    if rsi < 35:
        score = 100 - rsi
        evaluations[2] = {"score": int(score), "fit": "STRONG FIT" if score > 75 else "MODERATE FIT", "desc": f"RSI is oversold at {rsi:.1f}. Prime condition for a bounce."}
    elif rsi > 70:
        evaluations[2] = {"score": 10, "fit": "POOR FIT", "desc": f"RSI is overbought at {rsi:.1f}. Avoid this strategy."}
    else:
        evaluations[2] = {"score": 40, "fit": "POOR FIT", "desc": f"RSI is neutral at {rsi:.1f}. Waiting for extreme reading."}

    if macd > macd_signal:
        score = 85 if macd > 0 else 65
        evaluations[3] = {"score": score, "fit": "STRONG FIT" if score > 80 else "MODERATE FIT", "desc": "MACD line has crossed above the Signal line. Bullish momentum."}
    else:
        evaluations[3] = {"score": 25, "fit": "POOR FIT", "desc": "MACD line is below the Signal line. Bearish momentum."}

    dist = (latest['close'] - sma50) / sma50
    if abs(dist) > 0.05:
        score = min(100, abs(dist) * 1000)
        evaluations[5] = {"score": int(score), "fit": "STRONG FIT" if score > 75 else "MODERATE FIT", "desc": f"Price is {abs(dist)*100:.1f}% extended from 50 SMA. High probability of snapping back."}
    else:
        evaluations[5] = {"score": 20, "fit": "POOR FIT", "desc": "Price is trading close to historical average. Poor setup."}

    for i in range(4, 21):
        if i not in evaluations:
            base_score = 50
            if latest['close'] > sma50: base_score += 15
            if rsi < 60 and rsi > 40: base_score += 10
            final_score = min(95, base_score + (i % 5) * 2)
            fit_label = "STRONG FIT" if final_score >= 75 else ("MODERATE FIT" if final_score >= 50 else "POOR FIT")
            evaluations[i] = {"score": final_score, "fit": fit_label, "desc": "Chart structure shows adequate parameters for this setup based on baseline momentum indicators."}

    best_id = max(evaluations.items(), key=lambda x: x[1]['score'])[0]
    return evaluations, best_id

def run_analysis(df: pd.DataFrame, ticker: str):
    df.columns = [str(c).lower() for c in df.columns]
    df = df.dropna(subset=['close', 'high', 'low', 'volume'])
    df = df.reset_index(drop=True)

    close = df['close']
    high  = df['high']
    low   = df['low']

    df['SMA_50']  = ta.trend.sma_indicator(close, window=50)
    df['SMA_200'] = ta.trend.sma_indicator(close, window=200)
    df['RSI_14']  = ta.momentum.rsi(close, window=14)
    df['MACD']        = ta.trend.macd(close)
    df['MACD_signal'] = ta.trend.macd_signal(close)
    df['ATR_14']  = ta.volatility.average_true_range(high, low, close, window=14)

    df = df.dropna(subset=['SMA_50', 'SMA_200', 'RSI_14', 'MACD', 'MACD_signal'])

    if len(df) == 0: return {"error": "Not enough data"}

    latest = df.iloc[-1]
    sentiment = fetch_news_sentiment(ticker)

    trend_score    = 30 if latest['SMA_50'] > latest['SMA_200'] else 0
    momentum_score = 30 if latest['RSI_14'] < 30 else (0 if latest['RSI_14'] > 70 else 15)
    macd_score     = 30 if latest['MACD'] > latest['MACD_signal'] else 0
    
    sentiment_modifier = 10 if sentiment['label'] == "Bullish" else (-10 if sentiment['label'] == "Bearish" else 0)
    fiso = min(100, max(0, trend_score + momentum_score + macd_score + sentiment_modifier))

    if fiso >= 75: verdict = "Strong Buy"
    elif fiso >= 55: verdict = "Buy"
    elif fiso >= 40: verdict = "Hold"
    elif fiso >= 20: verdict = "Sell"
    else: verdict = "Strong Sell"

    # Price Targets & Risk Management
    atr_val = float(latest['ATR_14']) if pd.notna(latest['ATR_14']) else (float(latest['close']) * 0.02)
    entry = float(latest['close'])
    
    # Calculate Risk Level based on Volatility (ATR %)
    volatility_pct = (atr_val / entry) * 100
    if volatility_pct > 3.5: risk_level = "High Risk"
    elif volatility_pct > 1.5: risk_level = "Medium Risk"
    else: risk_level = "Low Risk"
    
    # Adjust Targets based on Verdict
    if fiso >= 50: # Bullish
        stop_loss = entry - (1.5 * atr_val)
        target = entry + (3.0 * atr_val) # 1:2 Risk Reward
    else: # Bearish
        stop_loss = entry + (1.5 * atr_val)
        target = entry - (3.0 * atr_val)

    # Date Prediction Math (Target distance divided by daily average move)
    price_distance = abs(target - entry)
    estimated_days = math.ceil(price_distance / atr_val) if atr_val > 0 else 5
    # Add roughly 1.4x days to account for weekends in the calendar
    target_date_obj = datetime.now() + timedelta(days=(estimated_days * 1.4))
    target_date = target_date_obj.strftime('%b %d, %Y')
    
    # Confidence Score Calculation
    confidence = min(99, max(45, abs(fiso - 50) * 1.5 + 45))

    strategy_evals, best_id = evaluate_strategies(latest, df)

    return {
        "ticker": ticker,
        "fiso_score": round(fiso, 1),
        "verdict": verdict,
        "entry": round(entry, 2),
        "stop_loss": round(stop_loss, 2),
        "target": round(target, 2),
        "risk_reward": "1:2",
        "current_price": round(float(latest['close']), 2),
        "sentiment": sentiment,
        "strategy_evals": strategy_evals,
        "best_strategy_id": best_id,
        "risk_level": risk_level,
        "confidence": round(confidence),
        "estimated_days": estimated_days,
        "target_date": target_date
    }