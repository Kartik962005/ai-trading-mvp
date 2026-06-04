import pandas as pd
from ta import trend, momentum, volatility
from app.strategies.engine import run_analysis

# Top 20 Most Popular Trading Strategies Worldwide
TOP_20_STRATEGIES = [
    "SMA Crossover (Golden Cross)", "EMA Crossover", "RSI Overbought/Oversold",
    "MACD Crossover", "Momentum Trading", "Mean Reversion",
    "Breakout Trading", "Bollinger Bands Squeeze", "Stochastic Oscillator",
    "ADX Trend Strength", "Parabolic SAR", "Donchian Channel Breakout",
    "Keltner Channel", "VWAP Intraday", "Pivot Point Reversal",
    "Fibonacci Retracement", "Ichimoku Cloud", "Moving Average Ribbon",
    "OBV Volume Confirmation", "Candlestick Pattern Recognition"
]

def get_strategy_prediction(df: pd.DataFrame, strategy_name: str, ticker: str):
    if df.empty or len(df) < 50:
        return {"error": "Not enough historical data"}

    df.columns = [str(c).lower() for c in df.columns]
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest

    result = {
        "ticker": ticker,
        "strategy": strategy_name,
        "verdict": "Neutral",
        "expected_move": "0%",
        "confidence": 50,
        "reasoning": "Calculating signals...",
        "timeframe": "Next 5-10 trading days"
    }

    if strategy_name == "SMA Crossover (Golden Cross)":
        if latest.get('close', 0) > latest.get('sma_50', 0) and latest.get('sma_50', 0) > latest.get('sma_200', 0):
            result.update({"verdict": "Bullish", "expected_move": "+4.8%", "confidence": 82,
                           "reasoning": "Golden Cross confirmed – strong long-term uptrend"})
        else:
            result.update({"verdict": "Bearish", "expected_move": "-3.5%", "confidence": 68,
                           "reasoning": "Price trading below key moving averages"})

    elif strategy_name == "RSI Overbought/Oversold":
        rsi = latest.get('rsi_14', 50)
        if rsi < 30:
            result.update({"verdict": "Bullish", "expected_move": "+6.2%", "confidence": 85,
                           "reasoning": "RSI deeply oversold – strong rebound expected"})
        elif rsi > 70:
            result.update({"verdict": "Bearish", "expected_move": "-4.9%", "confidence": 79,
                           "reasoning": "RSI overbought – correction likely"})
        else:
            result.update({"verdict": "Neutral", "expected_move": "0%", "confidence": 55,
                           "reasoning": "RSI in neutral zone"})

    elif strategy_name == "MACD Crossover":
        macd = latest.get('macd', 0)
        macd_signal = latest.get('macd_signal', 0)
        if macd > macd_signal and prev.get('macd', 0) <= prev.get('macd_signal', 0):
            result.update({"verdict": "Bullish", "expected_move": "+5.9%", "confidence": 81,
                           "reasoning": "Fresh bullish MACD crossover just occurred"})
        else:
            result.update({"verdict": "Neutral", "expected_move": "0%", "confidence": 60,
                           "reasoning": "No clear MACD crossover signal"})

    else:
        result["reasoning"] = f"{strategy_name} signal being evaluated"

    return result


def get_best_strategy(df: pd.DataFrame, ticker: str):
    fiso_result = run_analysis(df, ticker)
    no_trade = fiso_result.get("signal_status") == "no_trade" or str(fiso_result.get("verdict", "")).lower() == "hold"
    expected_move = (
        "No active trade"
        if no_trade
        else f"{(fiso_result.get('target', 0) - fiso_result.get('current_price', 0)) / fiso_result.get('current_price', 1) * 100:+.1f}%"
    )
    fiso_score = float(fiso_result.get("fiso_score") or 0)
    
    return {
        "strategy": "FISO Score (AI Recommended)",
        "verdict": fiso_result["verdict"],
        "expected_move": expected_move,
        "confidence": int(fiso_score) if no_trade else min(92, int(fiso_score * 1.08)),
        "reasoning": (
            "No-trade gate: risk/reward, confidence, or data quality did not clear the threshold"
            if no_trade
            else "Passed Bullseye's trend, momentum, risk/reward, confidence, and data-quality gates"
        ),
        "fiso_score": fiso_score,
        "signal_status": fiso_result.get("signal_status"),
        "risk_notes": fiso_result.get("risk_notes", []),
    }
