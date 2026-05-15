import os
import pandas as pd
from groq import Groq
from dotenv import load_dotenv
# Force this specific file to open the .env vault
load_dotenv()
# Initialize Groq client (Make sure to add GROQ_API_KEY to your .env file)
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def translate_to_pandas(user_prompt: str) -> str:
    """Uses LLM to convert english into a Pandas boolean expression."""
    system_prompt = """
    You are a quantitative finance assistant. The user will give you a trading strategy.
    You must translate it into a Python Pandas boolean expression using the variable 'df'.
    
    Available columns: 
    df['open'], df['close'], df['high'], df['low'], df['volume'], df['SMA_50'], df['SMA_200'], df['RSI_14']
    
    Rules:
    1. ONLY output the python expression. No markdown, no quotes, no explanations.
    2. Use df['close'].shift(1) for previous day's close.
    3. Example User: "down 2 days in a row"
       Example Output: (df['close'] < df['close'].shift(1)) & (df['close'].shift(1) < df['close'].shift(2))
    """
    
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile", # Free tier model
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.1, # Keep it low for strict code generation
    )
    
    return completion.choices[0].message.content.strip()

def run_custom_backtest(df: pd.DataFrame, user_prompt: str):
    """Evaluates the strategy on historical data and calculates performance."""
    try:
        # 1. Get the pandas logic from the LLM
        pandas_logic = translate_to_pandas(user_prompt)
        
        # 2. Safely evaluate the logic to create a boolean mask of "Buy Signals"
        # We pass {'df': df} as the local dictionary so the eval function knows what 'df' is
        buy_signals = eval(pandas_logic, {"df": df, "pd": pd})
        
        # 3. Calculate Forward Returns (If we buy today, what is the return tomorrow?)
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
        return {"error": f"Failed to parse or run strategy. Please rephrase. (Error: {str(e)})"}