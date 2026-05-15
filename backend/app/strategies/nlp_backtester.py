import os
import pandas as pd
from groq import Groq
from dotenv import load_dotenv
# Force this specific file to open the .env vault
load_dotenv()
# Initialize Groq client (Make sure to add GROQ_API_KEY to your .env file)
# ADD THIS INSTEAD:
_client = None  # Will be created only when first needed

def get_client():
    global _client
    if _client is None:  # Only create it once
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY environment variable is not set.")
        _client = Groq(api_key=api_key)
    return _client
def translate_to_pandas(user_prompt: str) -> str:
    """Uses LLM to convert english into a Pandas boolean expression."""
    system_prompt = """
    You are a quantitative finance assistant. The user will give you a trading strategy.
    You must translate it into a Python Pandas boolean expression using the variable 'df'.
    
    Available columns: 
    df['open'], df['close'], df['high'], df['low'], df['volume'], df['SMA_50'], df['SMA_200'], df['RSI_14']
    
    IMPORTANT: df['date'] is always a proper datetime column. You can use:
    - df['date'].dt.weekday  (Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4, Saturday=5, Sunday=6)
    - df['date'].dt.day_name() for day names like 'Monday', 'Friday'
    - df['date'].dt.month, df['date'].dt.year, df['date'].dt.day
    NEVER use df.index.weekday — always use df['date'].dt.weekday.
    
    Rules:
    1. ONLY output the python expression. No markdown, no quotes, no explanations.
    2. Use df['close'].shift(1) for previous day's close, df['open'].shift(-1) for next day's open.
    3. For "buy on day X and sell on day Y" strategies, the signal triggers on day X (the buy day).
       The forward return is automatically computed as next day's open or close, so just output the buy condition.
    4. Example User: "down 2 days in a row"
       Example Output: (df['close'] < df['close'].shift(1)) & (df['close'].shift(1) < df['close'].shift(2))
    5. Example User: "buy on Friday open sell on Monday open"
       Example Output: df['date'].dt.weekday == 4
    6. Example User: "RSI below 30"
       Example Output: df['RSI_14'] < 30
    """
    
    completion = get_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.1,
    )
    
    return completion.choices[0].message.content.strip()

def run_custom_backtest(df: pd.DataFrame, user_prompt: str):
    """Evaluates the strategy on historical data and calculates performance."""
    try:
        # Ensure date column is always a proper datetime (handles both string and RangeIndex cases)
        if 'date' in df.columns:
            df = df.copy()
            df['date'] = pd.to_datetime(df['date'])
        else:
            # date might be in the index
            df = df.copy().reset_index()
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date'])
            elif 'index' in df.columns:
                df = df.rename(columns={'index': 'date'})
                df['date'] = pd.to_datetime(df['date'])

        # 1. Get the pandas logic from the LLM
        pandas_logic = translate_to_pandas(user_prompt)

        # Strip any accidental markdown fences the LLM may have added
        pandas_logic = pandas_logic.replace("```python", "").replace("```", "").strip()

        # 2. Safely evaluate the logic to create a boolean mask of "Buy Signals"
        buy_signals = eval(pandas_logic, {"__builtins__": {}}, {"df": df, "pd": pd})

        # 3. Calculate Forward Returns — use next open if "sell on open" implied, else next close
        prompt_lower = user_prompt.lower()
        if "open" in prompt_lower and ("sell" in prompt_lower or "monday" in prompt_lower):
            df['forward_return_1d'] = (df['open'].shift(-1) - df['open']) / df['open']
        else:
            df['forward_return_1d'] = (df['close'].shift(-1) - df['close']) / df['close']

        # 4. Filter returns only for days where the strategy triggered a buy
        strategy_returns = df[buy_signals]['forward_return_1d'].dropna()

        # 5. Calculate Metrics
        total_trades = len(strategy_returns)
        if total_trades == 0:
            return {"error": "Strategy did not trigger any trades in the historical data.", "logic": pandas_logic}

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

    except Exception as e:
        return {"error": f"Could not run that strategy. Try rephrasing — e.g. 'RSI below 30 and volume above average'. (Detail: {str(e)})"}