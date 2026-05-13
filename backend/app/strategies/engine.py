import pandas as pd
import pandas_ta as ta

def run_analysis(df: pd.DataFrame, ticker: str):
    # Make sure column names are lowercase
    df.columns = [str(c).lower() for c in df.columns]
    
    # Calculate indicators explicitly (instead of .strategy("all"))
    df['SMA_50']  = ta.sma(df['close'], length=50)
    df['SMA_200'] = ta.sma(df['close'], length=200)
    df['RSI_14']  = ta.rsi(df['close'], length=14)
    
    macd = ta.macd(df['close'], fast=12, slow=26, signal=9)
    df['MACD']        = macd['MACD_12_26_9']
    df['MACD_signal'] = macd['MACDs_12_26_9']
    
    atr = ta.atr(df['high'], df['low'], df['close'], length=14)
    df['ATR_14'] = atr

    # Drop rows where indicators aren't ready yet (first 200 rows need SMA_200)
    df = df.dropna(subset=['SMA_50', 'SMA_200', 'RSI_14', 'MACD', 'MACD_signal'])
    
    if len(df) == 0:
        return {"error": "Not enough data to calculate indicators"}

    latest = df.iloc[-1]

    # FISO Score
    trend_score    = 30 if latest['SMA_50'] > latest['SMA_200'] else 0
    momentum_score = 30 if latest['RSI_14'] < 30 else (0 if latest['RSI_14'] > 70 else 15)
    macd_score     = 30 if latest['MACD'] > latest['MACD_signal'] else 0

    fiso = trend_score + momentum_score + macd_score  # max 90

    if fiso >= 70:
        verdict = "Strong Buy"
    elif fiso >= 50:
        verdict = "Buy"
    elif fiso >= 30:
        verdict = "Hold"
    elif fiso >= 10:
        verdict = "Sell"
    else:
        verdict = "Strong Sell"

    atr_val  = float(latest['ATR_14']) if pd.notna(latest['ATR_14']) else 10.0
    entry     = float(latest['close']) * 1.001
    stop_loss = entry - 1.5 * atr_val
    target    = entry + 2 * (entry - stop_loss)

    return {
        "ticker":        ticker,
        "fiso_score":    round(fiso, 1),
        "verdict":       verdict,
        "entry":         round(entry, 2),
        "stop_loss":     round(stop_loss, 2),
        "target":        round(target, 2),
        "risk_reward":   "1:2",
        "current_price": round(float(latest['close']), 2)
    }