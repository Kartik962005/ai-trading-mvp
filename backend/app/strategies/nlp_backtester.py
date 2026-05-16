import os
import re
import math
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


# ── LLM: translate natural language → two pandas expressions ─────────────────
def translate_strategy(user_prompt: str) -> dict:
    """
    Returns { "buy_expr": "...", "sell_expr": "...", "mode": "crossover"|"simple" }
    mode=crossover  → stateful simulation (buy once, hold, sell once)
    mode=simple     → simple forward-return mode (buy signal, hold 1 day)
    """
    system_prompt = """
You are a quantitative finance assistant. Convert the user's trading strategy into TWO separate single-line Python/Pandas boolean expressions.

AVAILABLE COLUMNS (df is a pandas DataFrame):
- df['open'], df['close'], df['high'], df['low'], df['volume']
- df['SMA_50'], df['SMA_200'], df['EMA_20'], df['EMA_50']
- df['RSI_14']
- df['MACD'], df['MACD_signal']
- df['ATR_14'], df['BBU'], df['BBL'], df['VOL_SMA_20']
- df['date']  — datetime column. Use df['date'].dt.weekday, df['date'].dt.month etc.

COMMON PATTERNS:
- RSI crosses above X:  (df['RSI_14'] > X) & (df['RSI_14'].shift(1) <= X)
- RSI crosses below X:  (df['RSI_14'] < X) & (df['RSI_14'].shift(1) >= X)
- SMA golden cross:     (df['SMA_50'] > df['SMA_200']) & (df['SMA_50'].shift(1) <= df['SMA_200'].shift(1))
- MACD bullish cross:   (df['MACD'] > df['MACD_signal']) & (df['MACD'].shift(1) <= df['MACD_signal'].shift(1))
- Weekly return -5%:    (df['close'] - df['close'].shift(5)) / df['close'].shift(5) < -0.05
- Above all MAs:        (df['close'] > df['SMA_50']) & (df['close'] > df['SMA_200']) & (df['close'] > df['EMA_20']) & (df['close'] > df['EMA_50'])
- 2 consecutive up days: (df['close'] > df['close'].shift(1)) & (df['close'].shift(1) > df['close'].shift(2))
- Volume spike:         df['volume'] > df['VOL_SMA_20'] * 1.5
- First day of month:   df['date'].dt.month != df['date'].dt.month.shift(1)

OUTPUT FORMAT — respond with EXACTLY this JSON (no markdown, no explanation):
{"buy_expr": "<single line pandas expression>", "sell_expr": "<single line pandas expression>", "mode": "crossover"}

Use mode="crossover" when the strategy has a clear BUY condition and a separate SELL condition (hold between them).
Use mode="simple" when the strategy is just a buy signal with no explicit sell (will use 1-day forward return).

EXAMPLES:
User: "buy when RSI crosses above 30, sell when RSI crosses above 70"
Output: {"buy_expr": "(df['RSI_14'] > 30) & (df['RSI_14'].shift(1) <= 30)", "sell_expr": "(df['RSI_14'] > 70) & (df['RSI_14'].shift(1) <= 70)", "mode": "crossover"}

User: "buy when MACD crosses above signal line, sell when it crosses below"
Output: {"buy_expr": "(df['MACD'] > df['MACD_signal']) & (df['MACD'].shift(1) <= df['MACD_signal'].shift(1))", "sell_expr": "(df['MACD'] < df['MACD_signal']) & (df['MACD'].shift(1) >= df['MACD_signal'].shift(1))", "mode": "crossover"}

User: "buy after 5% weekly fall"
Output: {"buy_expr": "(df['close'] - df['close'].shift(5)) / df['close'].shift(5) < -0.05", "sell_expr": "(df['close'] - df['close'].shift(5)) / df['close'].shift(5) > 0.03", "mode": "crossover"}

User: "RSI below 30"
Output: {"buy_expr": "df['RSI_14'] < 30", "sell_expr": "df['RSI_14'] > 70", "mode": "simple"}

User: "close above SMA50 and volume spike"
Output: {"buy_expr": "(df['close'] > df['SMA_50']) & (df['volume'] > df['VOL_SMA_20'] * 1.5)", "sell_expr": "df['close'] < df['SMA_50']", "mode": "simple"}
"""
    completion = get_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt}
        ],
        temperature=0.05,
    )
    raw = completion.choices[0].message.content.strip()
    raw = re.sub(r"```[\w]*", "", raw).replace("```", "").strip()

    import json
    try:
        return json.loads(raw)
    except Exception:
        # Fallback: try to extract buy/sell exprs manually
        buy  = re.search(r'"buy_expr"\s*:\s*"([^"]+)"',  raw)
        sell = re.search(r'"sell_expr"\s*:\s*"([^"]+)"', raw)
        mode = "crossover" if "crossover" in raw else "simple"
        return {
            "buy_expr":  buy.group(1)  if buy  else "df['RSI_14'] < 30",
            "sell_expr": sell.group(1) if sell else "df['RSI_14'] > 70",
            "mode": mode
        }


# ── Prepare DataFrame with all indicators ────────────────────────────────────
def _prepare_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
    else:
        df = df.reset_index()
        col = 'date' if 'date' in df.columns else df.columns[0]
        df = df.rename(columns={col: 'date'})
        df['date'] = pd.to_datetime(df['date'])

    # Normalise column names
    df.columns = [c.lower() for c in df.columns]
    df = df.sort_values('date').reset_index(drop=True)

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
    except Exception:
        pass

    return df


# ── Core stateful simulation (buy → hold → sell) ─────────────────────────────
def _run_crossover_simulation(df, buy_expr, sell_expr):
    local_vars = {"df": df, "pd": pd, "np": np}
    safe_env   = {"__builtins__": {}}

    buy_signals  = eval(buy_expr,  safe_env, local_vars).fillna(False).astype(bool)
    sell_signals = eval(sell_expr, safe_env, local_vars).fillna(False).astype(bool)

    trades = []
    in_trade = False
    buy_date = buy_price = None

    for i in range(len(df)):
        row = df.iloc[i]

        if not in_trade and buy_signals.iloc[i]:
            buy_date  = row['date']
            buy_price = float(row['open']) if not np.isnan(row['open']) else float(row['close'])
            buy_rsi   = round(float(row['RSI_14']), 1) if 'RSI_14' in df.columns else None
            in_trade  = True

        elif in_trade and sell_signals.iloc[i]:
            sell_price = float(row['open']) if not np.isnan(row['open']) else float(row['close'])
            sell_date  = row['date']
            sell_rsi   = round(float(row['RSI_14']), 1) if 'RSI_14' in df.columns else None
            pnl_pct    = (sell_price - buy_price) / buy_price * 100

            trades.append({
                "buy_date":      str(buy_date.date()),
                "buy_price":     round(buy_price, 2),
                "buy_rsi":       buy_rsi,
                "sell_date":     str(sell_date.date()),
                "sell_price":    round(sell_price, 2),
                "sell_rsi":      sell_rsi,
                "holding_days":  (sell_date - buy_date).days,
                "pnl_per_share": round(sell_price - buy_price, 2),
                "pnl_100shares": round((sell_price - buy_price) * 100, 2),
                "return_pct":    round(pnl_pct, 2),
                "result":        "WIN" if pnl_pct > 0 else "LOSS"
            })
            in_trade = False

    # Open trade
    open_trade = None
    if in_trade:
        last = df.iloc[-1]
        cur  = float(last['close'])
        open_trade = {
            "buy_date":       str(buy_date.date()),
            "buy_price":      round(buy_price, 2),
            "current_price":  round(cur, 2),
            "current_rsi":    round(float(last['RSI_14']), 1) if 'RSI_14' in df.columns else None,
            "holding_days":   (last['date'] - buy_date).days,
            "unrealised_pnl": round((cur - buy_price) * 100, 2),
            "return_pct":     round((cur - buy_price) / buy_price * 100, 2)
        }

    return trades, open_trade


# ── Simple mode (1-day forward return) ───────────────────────────────────────
def _run_simple_simulation(df, buy_expr):
    local_vars  = {"df": df, "pd": pd, "np": np}
    buy_signals = eval(buy_expr, {"__builtins__": {}}, local_vars).fillna(False).astype(bool)

    df['_fwd'] = (df['close'].shift(-1) - df['close']) / df['close']
    rets = df[buy_signals]['_fwd'].dropna()

    trades = []
    for idx in df[buy_signals].index:
        if idx + 1 >= len(df): continue
        row      = df.iloc[idx]
        next_row = df.iloc[idx + 1]
        pnl_pct  = (float(next_row['close']) - float(row['close'])) / float(row['close']) * 100
        trades.append({
            "buy_date":      str(row['date'].date()),
            "buy_price":     round(float(row['close']), 2),
            "buy_rsi":       round(float(row['RSI_14']), 1) if 'RSI_14' in df.columns else None,
            "sell_date":     str(next_row['date'].date()),
            "sell_price":    round(float(next_row['close']), 2),
            "sell_rsi":      round(float(next_row['RSI_14']), 1) if 'RSI_14' in df.columns else None,
            "holding_days":  1,
            "pnl_per_share": round(float(next_row['close']) - float(row['close']), 2),
            "pnl_100shares": round((float(next_row['close']) - float(row['close'])) * 100, 2),
            "return_pct":    round(pnl_pct, 2),
            "result":        "WIN" if pnl_pct > 0 else "LOSS"
        })
    return trades, None


# ── Chart data builder ────────────────────────────────────────────────────────
def _build_chart_data(df, trades, indicator_col=None):
    """Returns price + indicator series + trade markers for frontend charting."""
    price_series = [
        {"date": str(row['date'].date()), "close": round(float(row['close']), 2)}
        for _, row in df.iterrows()
    ]

    indicator_series = []
    if indicator_col and indicator_col in df.columns:
        indicator_series = [
            {"date": str(row['date'].date()), "value": round(float(row[indicator_col]), 2)}
            for _, row in df.iterrows()
            if not np.isnan(row[indicator_col])
        ]

    buy_markers  = [{"date": t["buy_date"],  "price": t["buy_price"],  "type": "buy"}  for t in trades]
    sell_markers = [{"date": t["sell_date"], "price": t["sell_price"], "type": "sell"} for t in trades]

    return {
        "price":      price_series,
        "indicator":  indicator_series,
        "markers":    buy_markers + sell_markers
    }


# ── Summary statistics ────────────────────────────────────────────────────────
def _compute_summary(trades):
    if not trades:
        return None
    td = pd.DataFrame(trades)
    total   = len(td)
    wins    = int((td['return_pct'] > 0).sum())
    losses  = total - wins
    returns = td['return_pct'] / 100

    # Max drawdown
    cumulative = (1 + returns).cumprod()
    peak       = cumulative.cummax()
    drawdown   = ((cumulative - peak) / peak * 100).min()

    avg_win  = round(td[td['result']=='WIN']['return_pct'].mean(), 2)  if wins   else 0
    avg_loss = round(td[td['result']=='LOSS']['return_pct'].mean(), 2) if losses else 0
    rr_ratio = round(abs(avg_win / avg_loss), 2) if avg_loss != 0 else 0

    return {
        "total_trades":            total,
        "wins":                    wins,
        "losses":                  losses,
        "win_rate":                round(wins / total * 100, 2),
        "total_pnl_100shares":     round(td['pnl_100shares'].sum(), 2),
        "avg_pnl_per_trade":       round(td['pnl_100shares'].mean(), 2),
        "avg_return_per_trade_pct":round(td['return_pct'].mean(), 2),
        "total_return_pct":        round(((1 + returns).prod() - 1) * 100, 2),
        "best_trade_pct":          round(td['return_pct'].max(), 2),
        "worst_trade_pct":         round(td['return_pct'].min(), 2),
        "avg_win_pct":             avg_win,
        "avg_loss_pct":            avg_loss,
        "risk_reward_ratio":       rr_ratio,
        "avg_holding_days":        round(td['holding_days'].mean(), 1),
        "max_drawdown_pct":        round(drawdown, 2),
        "profit_factor":           round(
            td[td['result']=='WIN']['pnl_100shares'].sum() /
            abs(td[td['result']=='LOSS']['pnl_100shares'].sum()), 2
        ) if losses > 0 else 999,
    }


# ── Main entry point ──────────────────────────────────────────────────────────
def run_custom_backtest(df: pd.DataFrame, user_prompt: str):
    try:
        df = _prepare_df(df)

        # Detect which indicator to show in chart
        prompt_lower = user_prompt.lower()
        indicator_col = None
        if 'rsi'  in prompt_lower: indicator_col = 'RSI_14'
        elif 'macd' in prompt_lower: indicator_col = 'MACD'
        elif 'sma' in prompt_lower or 'moving average' in prompt_lower: indicator_col = 'SMA_50'
        elif 'bollinger' in prompt_lower or 'bband' in prompt_lower: indicator_col = 'BBU'

        # Translate strategy
        strategy = translate_strategy(user_prompt)
        buy_expr  = strategy.get("buy_expr", "")
        sell_expr = strategy.get("sell_expr", "")
        mode      = strategy.get("mode", "crossover")

        # Run simulation
        if mode == "crossover":
            trades, open_trade = _run_crossover_simulation(df, buy_expr, sell_expr)
        else:
            trades, open_trade = _run_simple_simulation(df, buy_expr)

        if not trades and not open_trade:
            return {
                "error": "No trades triggered by this strategy on the available data. "
                         "The condition may be too strict or the data period too short.",
                "buy_expr":  buy_expr,
                "sell_expr": sell_expr,
            }

        summary    = _compute_summary(trades)
        chart_data = _build_chart_data(df, trades, indicator_col)

        # Current signal — does buy condition trigger on the latest row?
        try:
            local_vars   = {"df": df, "pd": pd, "np": np}
            buy_signals  = eval(buy_expr,  {"__builtins__": {}}, local_vars).fillna(False)
            sell_signals = eval(sell_expr, {"__builtins__": {}}, local_vars).fillna(False)
            current_signal = "BUY"  if bool(buy_signals.iloc[-1])  else \
                             "SELL" if bool(sell_signals.iloc[-1]) else "HOLD"
        except Exception:
            current_signal = "HOLD"

        return {
            "success":        True,
            "prompt":         user_prompt,
            "buy_expr":       buy_expr,
            "sell_expr":      sell_expr,
            "mode":           mode,
            "current_signal": current_signal,
            "summary":        summary,
            "trades":         trades[-20:],   # last 20 trades for table
            "open_trade":     open_trade,
            "chart_data":     chart_data,
            # flat fields for backward compat with existing frontend
            "total_trades":             summary["total_trades"]             if summary else 0,
            "win_rate":                 summary["win_rate"]                 if summary else 0,
            "avg_return_per_trade_pct": summary["avg_return_per_trade_pct"] if summary else 0,
            "total_return_pct":         summary["total_return_pct"]         if summary else 0,
        }

    except Exception as e:
        return _fallback_backtest(df if 'df' in dir() else pd.DataFrame(), user_prompt, str(e))


def _fallback_backtest(df, user_prompt, original_error):
    try:
        df = _prepare_df(df)
        fallback_system = """
Convert this trading strategy to the SIMPLEST possible single-line Pandas buy expression.
Use only: df['close'], df['RSI_14'], df['SMA_50'], df['SMA_200'], df['MACD'], df['MACD_signal'].
Output ONLY valid Python. One line. No markdown.
If unsure, output: df['RSI_14'] < 35
"""
        completion = get_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": fallback_system},
                {"role": "user",   "content": f"Strategy: {user_prompt}\nError: {original_error}"}
            ],
            temperature=0.0,
        )
        raw = completion.choices[0].message.content.strip()
        raw = re.sub(r"```[\w]*", "", raw).replace("```", "").strip()
        lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.strip().startswith("#")]
        expr  = lines[0] if lines else "df['RSI_14'] < 35"

        trades, open_trade = _run_simple_simulation(df, expr)
        summary = _compute_summary(trades)
        if not summary:
            return {"error": "Could not parse strategy. Try rephrasing — e.g. 'RSI below 30' or 'MACD bullish crossover'."}

        return {
            "success": True,
            "note":    "Simplified interpretation used",
            "summary": summary,
            "trades":  trades[-20:],
            "open_trade": open_trade,
            "chart_data": _build_chart_data(df, trades, 'RSI_14'),
            "current_signal": "HOLD",
            "total_trades":             summary["total_trades"],
            "win_rate":                 summary["win_rate"],
            "avg_return_per_trade_pct": summary["avg_return_per_trade_pct"],
            "total_return_pct":         summary["total_return_pct"],
        }
    except Exception as e2:
        return {"error": f"Could not run strategy. Please rephrase. (Detail: {str(e2)})"}
