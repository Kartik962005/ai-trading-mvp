import os
import re
import pandas as pd
import numpy as np
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY environment variable is not set.")
        _client = Groq(api_key=api_key)
    return _client


def translate_to_pandas(user_prompt: str) -> str:
    system_prompt = """
You are a quantitative finance assistant. Convert the user's trading strategy into a SINGLE LINE Python/Pandas boolean expression using the variable 'df'.

AVAILABLE COLUMNS:
- df['open'], df['close'], df['high'], df['low'], df['volume']
- df['SMA_50'], df['SMA_200'], df['EMA_20'], df['EMA_50'], df['RSI_14']
- df['MACD'], df['MACD_signal'], df['ATR_14']
- df['BBU'], df['BBL']  (Bollinger upper/lower bands)
- df['VOL_SMA_20']  (20-day average volume)
- df['date']  — always a proper datetime column

COMPUTED HELPERS you can use inline:
- Weekly return: (df['close'] - df['close'].shift(5)) / df['close'].shift(5)
- Monthly return: (df['close'] - df['close'].shift(21)) / df['close'].shift(21)
- Above all MAs: (df['close'] > df['SMA_50']) & (df['close'] > df['SMA_200']) & (df['close'] > df['EMA_20']) & (df['close'] > df['EMA_50'])
- Volume spike: df['volume'] > df['VOL_SMA_20'] * 1.5
- Day of week: df['date'].dt.weekday  (Mon=0 ... Fri=4)
- First trading day of month: df['date'].dt.month != df['date'].dt.month.shift(1)
- Last trading day of month: df['date'].dt.month != df['date'].dt.month.shift(-1)

STRICT RULES:
1. Output ONLY a single-line Python boolean Pandas expression. NO multi-line code, NO assignments, NO def, NO if/else, NO for loops, NO imports, NO comments, NO markdown.
2. The expression MUST work with eval() and return a boolean Series.
3. For "buy X% fall and sell Y% recovery" — output only the BUY signal (when to enter).
4. Never use df.index.weekday — always use df['date'].dt.weekday.
5. For percentage thresholds use decimals: 5% = 0.05, 3% = 0.03.

EXAMPLES:
"buy after 5% weekly fall"
→ (df['close'] - df['close'].shift(5)) / df['close'].shift(5) < -0.05

"buy when price is above all major moving averages"
→ (df['close'] > df['SMA_50']) & (df['close'] > df['SMA_200']) & (df['close'] > df['EMA_20']) & (df['close'] > df['EMA_50'])

"RSI below 30"
→ df['RSI_14'] < 30

"buy on Friday"
→ df['date'].dt.weekday == 4

"buy first trading day of month"
→ df['date'].dt.month != df['date'].dt.month.shift(1)

"MACD bullish crossover"
→ (df['MACD'] > df['MACD_signal']) & (df['MACD'].shift(1) <= df['MACD_signal'].shift(1))

"close above SMA50 with volume spike"
→ (df['close'] > df['SMA_50']) & (df['volume'] > df['VOL_SMA_20'] * 1.5)

"bollinger band squeeze breakout"
→ (df['close'] > df['BBU']) & (df['BBU'] - df['BBL'] < (df['BBU'] - df['BBL']).rolling(20).mean() * 0.8)

"3 consecutive green candles"
→ (df['close'] > df['open']) & (df['close'].shift(1) > df['open'].shift(1)) & (df['close'].shift(2) > df['open'].shift(2))

"price drops 10% from 20 day high"
→ df['close'] < df['high'].rolling(20).max() * 0.90
"""

    completion = get_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.05,
    )

    raw = completion.choices[0].message.content.strip()
    # Strip markdown fences if LLM added them
    raw = re.sub(r"```[\w]*", "", raw).replace("```", "").strip()
    # Take only first non-comment non-empty line
    lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.strip().startswith("#")]
    return lines[0] if lines else raw


def _prepare_df(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure date is datetime and all indicator columns exist."""
    df = df.copy()

    # Ensure date column is datetime
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
    else:
        df = df.reset_index()
        col = 'date' if 'date' in df.columns else df.columns[0]
        df = df.rename(columns={col: 'date'})
        df['date'] = pd.to_datetime(df['date'])

    df = df.sort_values('date').reset_index(drop=True)

    # Add all indicators the LLM might reference
    try:
        import ta as ta_lib
        close = df['close']
        high  = df['high']
        low   = df['low']
        vol   = df['volume']

        if 'SMA_50'      not in df.columns: df['SMA_50']      = close.rolling(50).mean()
        if 'SMA_200'     not in df.columns: df['SMA_200']     = close.rolling(200).mean()
        if 'EMA_20'      not in df.columns: df['EMA_20']      = close.ewm(span=20, adjust=False).mean()
        if 'EMA_50'      not in df.columns: df['EMA_50']      = close.ewm(span=50, adjust=False).mean()
        if 'RSI_14'      not in df.columns: df['RSI_14']      = ta_lib.momentum.rsi(close, window=14)
        if 'MACD'        not in df.columns: df['MACD']        = ta_lib.trend.macd(close)
        if 'MACD_signal' not in df.columns: df['MACD_signal'] = ta_lib.trend.macd_signal(close)
        if 'ATR_14'      not in df.columns: df['ATR_14']      = ta_lib.volatility.average_true_range(high, low, close, window=14)
        if 'BBU'         not in df.columns: df['BBU']         = ta_lib.volatility.bollinger_hband(close, window=20, window_dev=2)
        if 'BBL'         not in df.columns: df['BBL']         = ta_lib.volatility.bollinger_lband(close, window=20, window_dev=2)
        if 'VOL_SMA_20'  not in df.columns: df['VOL_SMA_20']  = vol.rolling(20).mean()
        # Also support old column names from engine.py
        if 'BBU_14_2.0'  in df.columns and 'BBU' not in df.columns: df['BBU'] = df['BBU_14_2.0']
        if 'BBL_14_2.0'  in df.columns and 'BBL' not in df.columns: df['BBL'] = df['BBL_14_2.0']
    except Exception:
        pass  # indicators already present or ta not needed

    return df


def run_custom_backtest(df: pd.DataFrame, user_prompt: str):
    try:
        df = _prepare_df(df)

        # 1. Translate to pandas expression
        pandas_logic = translate_to_pandas(user_prompt)

        # 2. Evaluate safely with all helpers available
        local_vars = {
            "df": df,
            "pd": pd,
            "np": np,
        }
        buy_signals = eval(pandas_logic, {"__builtins__": {}}, local_vars)

        # Ensure it's a boolean Series aligned to df
        buy_signals = buy_signals.fillna(False).astype(bool)

        # 3. Forward return — use next open if prompt implies open-to-open
        prompt_lower = user_prompt.lower()
        sell_at_open = any(w in prompt_lower for w in ["sell open", "sell on open", "monday open", "selling open"])
        if sell_at_open:
            df['_fwd'] = (df['open'].shift(-1) - df['open']) / df['open']
        else:
            df['_fwd'] = (df['close'].shift(-1) - df['close']) / df['close']

        # 4. Calculate metrics
        strategy_returns = df[buy_signals]['_fwd'].dropna()
        total_trades = len(strategy_returns)

        if total_trades == 0:
            return {
                "error": "No trades triggered. The condition may be too strict — try broadening it.",
                "logic_used": pandas_logic
            }

        winning_trades  = int((strategy_returns > 0).sum())
        win_rate        = round(winning_trades / total_trades * 100, 2)
        avg_return      = round(strategy_returns.mean() * 100, 2)
        total_return    = round(((1 + strategy_returns).prod() - 1) * 100, 2)
        best_trade      = round(strategy_returns.max() * 100, 2)
        worst_trade     = round(strategy_returns.min() * 100, 2)
        avg_win         = round(strategy_returns[strategy_returns > 0].mean() * 100, 2) if winning_trades > 0 else 0
        avg_loss        = round(strategy_returns[strategy_returns <= 0].mean() * 100, 2) if (total_trades - winning_trades) > 0 else 0

        return {
            "success": True,
            "logic_used": pandas_logic,
            "total_trades": total_trades,
            "win_rate": win_rate,
            "avg_return_per_trade_pct": avg_return,
            "total_return_pct": total_return,
            "best_trade_pct": best_trade,
            "worst_trade_pct": worst_trade,
            "avg_win_pct": avg_win,
            "avg_loss_pct": avg_loss,
        }

    except SyntaxError as e:
        # Try a simpler fallback prompt
        return _fallback_backtest(df, user_prompt, str(e))
    except Exception as e:
        return _fallback_backtest(df, user_prompt, str(e))


def _fallback_backtest(df: pd.DataFrame, user_prompt: str, original_error: str):
    """
    If the LLM-generated expression fails, try a second simpler prompt
    before giving up. This ensures near-zero user-facing failures.
    """
    try:
        fallback_system = """
You are a quantitative finance assistant. Convert the strategy to the SIMPLEST possible single-line Pandas boolean expression using df['close'], df['open'], df['high'], df['low'], df['volume'], df['RSI_14'], df['SMA_50'], df['SMA_200'].
Output ONLY the expression. No explanation. No markdown. One line only.
If you cannot express it, output: df['close'] > df['close'].shift(1)
"""
        completion = get_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": fallback_system},
                {"role": "user", "content": f"Strategy: {user_prompt}\nPrevious attempt failed with: {original_error}\nSimplify and try again."}
            ],
            temperature=0.0,
        )
        raw = completion.choices[0].message.content.strip()
        raw = re.sub(r"```[\w]*", "", raw).replace("```", "").strip()
        lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.strip().startswith("#")]
        expression = lines[0] if lines else raw

        buy_signals = eval(expression, {"__builtins__": {}}, {"df": df, "pd": pd, "np": np})
        buy_signals = buy_signals.fillna(False).astype(bool)

        df['_fwd'] = (df['close'].shift(-1) - df['close']) / df['close']
        strategy_returns = df[buy_signals]['_fwd'].dropna()
        total_trades = len(strategy_returns)

        if total_trades == 0:
            return {"error": "No trades found even with simplified logic. Please rephrase the strategy.", "logic_used": expression}

        winning_trades = int((strategy_returns > 0).sum())
        return {
            "success": True,
            "logic_used": expression,
            "note": "Simplified interpretation used",
            "total_trades": total_trades,
            "win_rate": round(winning_trades / total_trades * 100, 2),
            "avg_return_per_trade_pct": round(strategy_returns.mean() * 100, 2),
            "total_return_pct": round(((1 + strategy_returns).prod() - 1) * 100, 2),
            "best_trade_pct": round(strategy_returns.max() * 100, 2),
            "worst_trade_pct": round(strategy_returns.min() * 100, 2),
            "avg_win_pct": round(strategy_returns[strategy_returns > 0].mean() * 100, 2) if winning_trades > 0 else 0,
            "avg_loss_pct": round(strategy_returns[strategy_returns <= 0].mean() * 100, 2) if (total_trades - winning_trades) > 0 else 0,
        }

    except Exception as e2:
        return {
            "error": f"Could not parse this strategy automatically. Try rephrasing it more simply — e.g. 'RSI below 30' or 'close above SMA 50 with volume spike'.",
            "detail": str(e2)
        }
