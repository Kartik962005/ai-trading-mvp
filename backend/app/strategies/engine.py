import pandas as pd
import ta

def run_analysis(df: pd.DataFrame, ticker: str):
    df.columns = [str(c).lower() for c in df.columns]
    df = df.dropna(subset=['close', 'high', 'low', 'volume'])
    df = df.reset_index(drop=True)

    close = df['close']
    high  = df['high']
    low   = df['low']

    # Indicators
    df['SMA_50']  = ta.trend.sma_indicator(close, window=50)
    df['SMA_200'] = ta.trend.sma_indicator(close, window=200)
    df['RSI_14']  = ta.momentum.rsi(close, window=14)
    df['MACD']        = ta.trend.macd(close)
    df['MACD_signal'] = ta.trend.macd_signal(close)
    df['ATR_14']  = ta.volatility.average_true_range(high, low, close, window=14)

    df = df.dropna(subset=['SMA_50', 'SMA_200', 'RSI_14', 'MACD', 'MACD_signal'])

    if len(df) == 0:
        return {"error": "Not enough data"}

    latest = df.iloc[-1]

    # FISO Score
    trend_score    = 30 if latest['SMA_50'] > latest['SMA_200'] else 0
    momentum_score = 30 if latest['RSI_14'] < 30 else (0 if latest['RSI_14'] > 70 else 15)
    macd_score     = 30 if latest['MACD'] > latest['MACD_signal'] else 0
    fiso = trend_score + momentum_score + macd_score

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

    atr_val   = float(latest['ATR_14']) if pd.notna(latest['ATR_14']) else 10.0
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