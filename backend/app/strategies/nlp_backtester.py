import os
import re
import pandas as pd
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
    """Uses LLM to convert English strategy description into a single-line Pandas boolean expression."""
    system_prompt = """
You are a quantitative finance assistant. Convert the user's trading strategy into a SINGLE LINE Python/Pandas boolean expression using the variable 'df'.

AVAILABLE COLUMNS:
- df['open'], df['close'], df['high'], df['low'], df['volume']
- df['SMA_50'], df['SMA_200'], df['RSI_14']
- df['date'] — always a proper datetime column. Use df['date'].dt.weekday, df['date'].dt.day, df['date'].dt.month etc.

DATE HELPERS (use these patterns):
- Day of week:  df['date'].dt.weekday  (Mon=0, Tue=1, Wed=2, Thu=3, Fri=4)
- First trading day of month:  (df['date'].dt.month != df['date'].dt.month.shift(1))
- Last trading day of month:   (df['date'].dt.month != df['date'].dt.month.shift(-1))
- First trading day of week:   (df['date'].dt.isocalendar().week != df['date'].dt.isocalendar().week.shift(1))
- Last trading day of week:    (df['date'].dt.isocalendar().week != df['date'].dt.isocalendar().week.shift(-1))

STRICT RULES:
1. Output ONLY a single Python boolean expression. Absolutely NO multi-line code, NO assignments, NO def, NO if, NO for, NO import, NO comments, NO markdown fences.
2. The expression must evaluate to a pandas boolean Series when eval() is called with {'df': df, 'pd': pd}.
3. Use df['close'].shift(1) for previous day's close, df['open'].shift(-1) for next open.
4. For "buy on day X sell on day Y", output only the BUY signal condition (when to enter).
5. If strategy uses weekday names map them: Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4.

EXAMPLES:
User: "buy opening price of friday and sell opening monday price"
Output: df['date'].dt.weekday == 4

User: "buy first trading day of month open and sell last trading day close"
Output: (df['date'].dt.month != df['date'].dt.month.shift(1))

User: "buy last trading day of month"
Output: (df['date'].dt.month != df['date'].dt.month.shift(-1))

User: "RSI below 30"
Output: df['RSI_14'] < 30

User: "close above SMA50 and volume spike"
Output: (df['close'] > df['SMA_50']) & (df['volume'] > df['volume'].rolling(20).mean() * 1.5)

User: "down 2 days in a row"
Output: (df['close'] < df['close'].shift(1)) & (df['close'].shift(1) < df['close'].shift(2))

User: "gap up open"
Output: df['open'] > df['close'].shift(1) * 1.01
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

    # Strip any accidental markdown fences or backticks the LLM added
    raw = re.sub(r"```[\w]*", "", raw).replace("```", "").strip()

    # If LLM returned multiple lines, take only the first non-empty expression line
    lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.strip().startswith("#")]
    expression = lines[0] if lines else raw

    return expression


def run_custom_backtest(df: pd.DataFrame, user_prompt: str):
    """Evaluates the strategy on historical data and calculates performance."""
    try:
        df = df.copy()

        # Always ensure date column is a proper datetime
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
        else:
            df = df.reset_index()
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date'])
            elif 'index' in df.columns:
                df = df.rename(columns={'index': 'date'})
                df['date'] = pd.to_datetime(df['date'])

        df = df.sort_values('date').reset_index(drop=True)

        # 1. Translate prompt to pandas expression
        pandas_logic = translate_to_pandas(user_prompt)

        # 2. Evaluate safely
        buy_signals = eval(pandas_logic, {"__builtins__": {}}, {"df": df, "pd": pd})

        # 3. Smart forward return — use next open if prompt implies selling at open
        prompt_lower = user_prompt.lower()
        sell_at_open = any(w in prompt_lower for w in ["sell open", "sell on open", "monday open", "sell opening"])
        if sell_at_open:
            df['forward_return_1d'] = (df['open'].shift(-1) - df['open']) / df['open']
        else:
            df['forward_return_1d'] = (df['close'].shift(-1) - df['close']) / df['close']

        # 4. Filter to buy signal days
        strategy_returns = df[buy_signals]['forward_return_1d'].dropna()

        total_trades = len(strategy_returns)
        if total_trades == 0:
            return {"error": "Strategy had no trades in the historical data. Try broadening the condition.", "logic": pandas_logic}

        winning_trades = len(strategy_returns[strategy_returns > 0])
        win_rate = (winning_trades / total_trades) * 100
        avg_return_per_trade = strategy_returns.mean() * 100
        total_compound_return = ((1 + strategy_returns).prod() - 1) * 100

        return {
            "success": True,
            "logic_used": pandas_logic,
            "total_trades": total_trades,
            "win_rate": round(win_rate, 2),
            "avg_return_per_trade_pct": round(avg_return_per_trade, 2),
            "total_return_pct": round(total_compound_return, 2)
        }

    except SyntaxError as e:
        return {"error": f"Could not parse that strategy — the AI generated invalid code. Try rephrasing more simply. (Detail: {str(e)})"}
    except Exception as e:
        return {"error": f"Could not run that strategy. Try rephrasing — e.g. 'RSI below 30 and volume above average'. (Detail: {str(e)})"}
