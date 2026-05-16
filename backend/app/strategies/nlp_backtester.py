import os
import re
import json
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


# ── Step 1: Prepare DataFrame with EVERY possible column ─────────────────────
def _prepare_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Normalise date
    if 'date' not in df.columns:
        df = df.reset_index()
        col = 'date' if 'date' in df.columns else df.columns[0]
        df = df.rename(columns={col: 'date'})
    df['date'] = pd.to_datetime(df['date'])
    df.columns = [c.lower() for c in df.columns]
    df = df.sort_values('date').reset_index(drop=True)

    close  = df['close']
    open_  = df['open']
    high   = df['high']
    low    = df['low']
    volume = df['volume']

    # ── Returns ───────────────────────────────────────────────────────────────
    df['day_return']   = close.pct_change() * 100
    df['week_return']  = close.pct_change(5) * 100
    df['month_return'] = close.pct_change(21) * 100
    df['prev_close']   = close.shift(1)
    df['prev_open']    = open_.shift(1)
    df['prev_high']    = high.shift(1)
    df['prev_low']     = low.shift(1)

    # ── Candle structure ──────────────────────────────────────────────────────
    df['body']        = abs(close - open_)
    df['upper_wick']  = high - df[['close','open']].max(axis=1)
    df['lower_wick']  = df[['close','open']].min(axis=1) - low
    df['is_green']    = (close > open_).astype(int)
    df['is_red']      = (close < open_).astype(int)
    df['gap_up']      = (open_ > close.shift(1) * 1.01)
    df['gap_down']    = (open_ < close.shift(1) * 0.99)
    df['vol_ratio']   = volume / volume.rolling(20).mean()

    # ── Moving averages ───────────────────────────────────────────────────────
    df['SMA_5']   = close.rolling(5).mean()
    df['SMA_10']  = close.rolling(10).mean()
    df['SMA_20']  = close.rolling(20).mean()
    df['SMA_50']  = close.rolling(50).mean()
    df['SMA_200'] = close.rolling(200).mean()
    df['EMA_9']   = close.ewm(span=9,  adjust=False).mean()
    df['EMA_20']  = close.ewm(span=20, adjust=False).mean()
    df['EMA_50']  = close.ewm(span=50, adjust=False).mean()
    df['VOL_SMA_20'] = volume.rolling(20).mean()

    # ── Momentum ──────────────────────────────────────────────────────────────
    try:
        import ta as ta_lib
        df['RSI_14']      = ta_lib.momentum.rsi(close, window=14)
        df['RSI_9']       = ta_lib.momentum.rsi(close, window=9)
        df['MACD']        = ta_lib.trend.macd(close)
        df['MACD_signal'] = ta_lib.trend.macd_signal(close)
        df['MACD_hist']   = df['MACD'] - df['MACD_signal']
        df['ATR_14']      = ta_lib.volatility.average_true_range(high, low, close, window=14)
        df['BBU']         = ta_lib.volatility.bollinger_hband(close, window=20, window_dev=2)
        df['BBL']         = ta_lib.volatility.bollinger_lband(close, window=20, window_dev=2)
        df['BBM']         = ta_lib.volatility.bollinger_mavg(close, window=20)
        df['BB_width']    = (df['BBU'] - df['BBL']) / df['BBM']
        df['STOCH_K']     = ta_lib.momentum.stoch(high, low, close)
        df['STOCH_D']     = ta_lib.momentum.stoch_signal(high, low, close)
        df['ADX']         = ta_lib.trend.adx(high, low, close)
        df['CCI']         = ta_lib.trend.cci(high, low, close)
        df['WILLIAMS_R']  = ta_lib.momentum.williams_r(high, low, close)
        df['OBV']         = ta_lib.volume.on_balance_volume(close, volume)
        df['MFI']         = ta_lib.volume.money_flow_index(high, low, close, volume)
    except Exception as e:
        print(f"[TA] Some indicators failed: {e}")

    # Alias common names the LLM might use
    for alias, col in [
        ('rsi', 'RSI_14'), ('macd', 'MACD'), ('atr', 'ATR_14'),
        ('sma50', 'SMA_50'), ('sma200', 'SMA_200'), ('ema20', 'EMA_20'),
    ]:
        if col in df.columns and alias not in df.columns:
            df[alias] = df[col]

    return df


# ── Step 2: LLM strategy translation ─────────────────────────────────────────
SYSTEM_PROMPT = """
You are a quantitative finance assistant. Convert the user's trading strategy into TWO single-line Python/Pandas boolean expressions.

AVAILABLE COLUMNS IN df:
Price: df['open'], df['close'], df['high'], df['low'], df['volume']
Returns: df['day_return'] (daily % change), df['week_return'] (5-day %), df['month_return'] (21-day %)
Previous: df['prev_close'], df['prev_open'], df['prev_high'], df['prev_low']
Candle: df['is_green'] (1/0), df['is_red'] (1/0), df['body'], df['upper_wick'], df['lower_wick']
Volume: df['vol_ratio'] (volume / 20d avg), df['VOL_SMA_20'], df['OBV'], df['MFI']
MAs: df['SMA_5'], df['SMA_10'], df['SMA_20'], df['SMA_50'], df['SMA_200'], df['EMA_9'], df['EMA_20'], df['EMA_50']
Momentum: df['RSI_14'], df['RSI_9'], df['MACD'], df['MACD_signal'], df['MACD_hist']
Volatility: df['ATR_14'], df['BBU'], df['BBL'], df['BBM'], df['BB_width']
Oscillators: df['STOCH_K'], df['STOCH_D'], df['ADX'], df['CCI'], df['WILLIAMS_R']
Date: df['date'].dt.weekday (Mon=0,Fri=4), df['date'].dt.month, df['date'].dt.day
Gaps: df['gap_up'] (bool), df['gap_down'] (bool)

RULES:
1. Output ONLY valid JSON with keys "buy_expr", "sell_expr", "mode". Nothing else.
2. mode = "crossover" if buy+sell are separate events (hold between them). mode = "simple" if just a signal.
3. Each expression must be a single-line pandas boolean Series. No assignments, no def, no loops.
4. Use .shift(1) for previous day. Use .shift(2) for 2 days ago.
5. For "crosses above X": (df['COL'] > X) & (df['COL'].shift(1) <= X)
6. For "crosses below X": (df['COL'] < X) & (df['COL'].shift(1) >= X)
7. For consecutive days: chain with .shift() — e.g. 2 consecutive up days: (df['day_return'] > 0) & (df['day_return'].shift(1) > 0)
8. Always wrap compound expressions in parentheses.

STRATEGY PATTERNS:
"2 consecutive days up 1%":  (df['day_return'].shift(1) >= 1.0) & (df['day_return'].shift(2) >= 1.0)
"2 consecutive days down 1%": (df['day_return'] <= -1.0) & (df['day_return'].shift(1) <= -1.0)
"RSI crosses above 30":  (df['RSI_14'] > 30) & (df['RSI_14'].shift(1) <= 30)
"RSI crosses above 70":  (df['RSI_14'] > 70) & (df['RSI_14'].shift(1) <= 70)
"above all major MAs":   (df['close'] > df['SMA_50']) & (df['close'] > df['SMA_200']) & (df['close'] > df['EMA_20']) & (df['close'] > df['EMA_50'])
"5% weekly fall":        df['week_return'] < -5.0
"3% weekly recovery":    df['week_return'] > 3.0
"MACD bullish cross":    (df['MACD'] > df['MACD_signal']) & (df['MACD'].shift(1) <= df['MACD_signal'].shift(1))
"MACD bearish cross":    (df['MACD'] < df['MACD_signal']) & (df['MACD'].shift(1) >= df['MACD_signal'].shift(1))
"golden cross":          (df['SMA_50'] > df['SMA_200']) & (df['SMA_50'].shift(1) <= df['SMA_200'].shift(1))
"death cross":           (df['SMA_50'] < df['SMA_200']) & (df['SMA_50'].shift(1) >= df['SMA_200'].shift(1))
"volume spike":          df['vol_ratio'] > 2.0
"bollinger breakout":    df['close'] > df['BBU']
"oversold bounce":       (df['RSI_14'] < 30) & (df['RSI_14'].shift(1) < 30)
"buy friday sell monday": buy=(df['date'].dt.weekday == 4), sell=(df['date'].dt.weekday == 0)
"3 green candles":       (df['is_green'] == 1) & (df['is_green'].shift(1) == 1) & (df['is_green'].shift(2) == 1)
"gap up":                df['gap_up'] == True

EXAMPLES:
User: "buy if stock up 1% two days in a row, sell if down 1% two consecutive days"
Output: {"buy_expr": "(df['day_return'].shift(1) >= 1.0) & (df['day_return'].shift(2) >= 1.0)", "sell_expr": "(df['day_return'] <= -1.0) & (df['day_return'].shift(1) <= -1.0)", "mode": "crossover"}

User: "buy RSI crosses 30, sell RSI crosses 70"
Output: {"buy_expr": "(df['RSI_14'] > 30) & (df['RSI_14'].shift(1) <= 30)", "sell_expr": "(df['RSI_14'] > 70) & (df['RSI_14'].shift(1) <= 70)", "mode": "crossover"}

User: "buy after 5% weekly fall sell after 3% recovery"
Output: {"buy_expr": "df['week_return'] < -5.0", "sell_expr": "df['week_return'] > 3.0", "mode": "crossover"}

User: "buy when price above all moving averages"
Output: {"buy_expr": "(df['close'] > df['SMA_50']) & (df['close'] > df['SMA_200']) & (df['close'] > df['EMA_20']) & (df['close'] > df['EMA_50'])", "sell_expr": "(df['close'] < df['SMA_50']) | (df['close'] < df['EMA_20'])", "mode": "crossover"}

User: "MACD golden cross"
Output: {"buy_expr": "(df['MACD'] > df['MACD_signal']) & (df['MACD'].shift(1) <= df['MACD_signal'].shift(1))", "sell_expr": "(df['MACD'] < df['MACD_signal']) & (df['MACD'].shift(1) >= df['MACD_signal'].shift(1))", "mode": "crossover"}

User: "RSI below 30"
Output: {"buy_expr": "df['RSI_14'] < 30", "sell_expr": "df['RSI_14'] > 70", "mode": "simple"}
"""

def translate_strategy(user_prompt: str) -> dict:
    completion = get_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt}
        ],
        temperature=0.0,
    )
    raw = completion.choices[0].message.content.strip()
    raw = re.sub(r"```[\w]*", "", raw).replace("```", "").strip()

    # Extract JSON
    try:
        # Try direct parse
        return json.loads(raw)
    except Exception:
        # Try to find JSON object in response
        m = re.search(r'\{[^}]+\}', raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
        # Manual extract
        buy  = re.search(r'"buy_expr"\s*:\s*"([^"]+)"',  raw)
        sell = re.search(r'"sell_expr"\s*:\s*"([^"]+)"', raw)
        mode = "crossover" if "crossover" in raw else "simple"
        return {
            "buy_expr":  buy.group(1)  if buy  else "df['RSI_14'] < 35",
            "sell_expr": sell.group(1) if sell else "df['RSI_14'] > 65",
            "mode":      mode
        }


# ── Step 3: Rule engine fallback (no LLM needed) ─────────────────────────────
RULE_PATTERNS = [
    # (regex pattern, buy_expr, sell_expr, mode)
    (r'rsi.*cross.*30|cross.*rsi.*30|rsi.*above.*30',
     "(df['RSI_14'] > 30) & (df['RSI_14'].shift(1) <= 30)",
     "(df['RSI_14'] > 70) & (df['RSI_14'].shift(1) <= 70)",
     "crossover"),
    (r'rsi.*below.*30|oversold',
     "df['RSI_14'] < 30",
     "df['RSI_14'] > 70",
     "crossover"),
    (r'rsi.*above.*70|overbought',
     "df['RSI_14'] > 70",
     "df['RSI_14'] < 30",
     "simple"),
    (r'golden cross|sma.*50.*cross.*200|50.*cross.*200',
     "(df['SMA_50'] > df['SMA_200']) & (df['SMA_50'].shift(1) <= df['SMA_200'].shift(1))",
     "(df['SMA_50'] < df['SMA_200']) & (df['SMA_50'].shift(1) >= df['SMA_200'].shift(1))",
     "crossover"),
    (r'death cross',
     "(df['SMA_50'] < df['SMA_200']) & (df['SMA_50'].shift(1) >= df['SMA_200'].shift(1))",
     "(df['SMA_50'] > df['SMA_200']) & (df['SMA_50'].shift(1) <= df['SMA_200'].shift(1))",
     "crossover"),
    (r'macd.*bull|macd.*cross.*signal|macd.*golden',
     "(df['MACD'] > df['MACD_signal']) & (df['MACD'].shift(1) <= df['MACD_signal'].shift(1))",
     "(df['MACD'] < df['MACD_signal']) & (df['MACD'].shift(1) >= df['MACD_signal'].shift(1))",
     "crossover"),
    (r'1%.*two.*day|two.*day.*1%|two.*consecutive.*up|up.*two.*day|two prev.*day.*1',
     "(df['day_return'].shift(1) >= 1.0) & (df['day_return'].shift(2) >= 1.0)",
     "(df['day_return'] <= -1.0) & (df['day_return'].shift(1) <= -1.0)",
     "crossover"),
    (r'5%.*week.*fall|week.*fall.*5%|week.*drop.*5',
     "df['week_return'] < -5.0",
     "df['week_return'] > 3.0",
     "crossover"),
    (r'above.*all.*ma|above.*all.*moving|price.*above.*all',
     "(df['close'] > df['SMA_50']) & (df['close'] > df['SMA_200']) & (df['close'] > df['EMA_20']) & (df['close'] > df['EMA_50'])",
     "(df['close'] < df['SMA_50']) | (df['close'] < df['EMA_20'])",
     "crossover"),
    (r'bollinger.*break|break.*bollinger|bb.*break',
     "df['close'] > df['BBU']",
     "df['close'] < df['BBM']",
     "crossover"),
    (r'volume.*spike|spike.*volume|vol.*2x',
     "df['vol_ratio'] > 2.0",
     "df['vol_ratio'] < 0.8",
     "simple"),
    (r'3.*green.*candle|three.*green|3.*consecutive.*green',
     "(df['is_green'] == 1) & (df['is_green'].shift(1) == 1) & (df['is_green'].shift(2) == 1)",
     "(df['is_red'] == 1) & (df['is_red'].shift(1) == 1)",
     "crossover"),
    (r'gap up|gap.*up|opening.*higher',
     "df['gap_up'] == True",
     "(df['close'] < df['prev_close'])",
     "simple"),
    (r'friday|buy.*friday',
     "df['date'].dt.weekday == 4",
     "df['date'].dt.weekday == 0",
     "crossover"),
]

def _rule_engine_fallback(user_prompt: str) -> dict | None:
    p = user_prompt.lower()
    for pattern, buy_expr, sell_expr, mode in RULE_PATTERNS:
        if re.search(pattern, p):
            return {"buy_expr": buy_expr, "sell_expr": sell_expr, "mode": mode}
    return None


# ── Step 4: Simulation engines ────────────────────────────────────────────────
def _eval_safe(expr: str, df: pd.DataFrame) -> pd.Series:
    local_vars = {"df": df, "pd": pd, "np": np}
    result = eval(expr, {"__builtins__": {}}, local_vars)
    return result.fillna(False).astype(bool)


def _run_crossover(df, buy_expr, sell_expr):
    buy_sig  = _eval_safe(buy_expr,  df)
    sell_sig = _eval_safe(sell_expr, df)

    trades = []
    in_trade = False
    buy_date = buy_price = buy_rsi = None

    for i in range(2, len(df)):
        row = df.iloc[i]
        if not in_trade and buy_sig.iloc[i]:
            buy_date  = row['date']
            buy_price = float(row['open']) if not pd.isna(row['open']) else float(row['close'])
            buy_rsi   = round(float(row.get('RSI_14', np.nan)), 1) if not pd.isna(row.get('RSI_14', np.nan)) else None
            in_trade  = True
        elif in_trade and sell_sig.iloc[i]:
            sell_price = float(row['open']) if not pd.isna(row['open']) else float(row['close'])
            pnl_pct    = (sell_price - buy_price) / buy_price * 100
            sell_rsi   = round(float(row.get('RSI_14', np.nan)), 1) if not pd.isna(row.get('RSI_14', np.nan)) else None
            trades.append({
                "buy_date":      str(buy_date.date()),
                "buy_price":     round(buy_price, 2),
                "buy_rsi":       buy_rsi,
                "sell_date":     str(row['date'].date()),
                "sell_price":    round(sell_price, 2),
                "sell_rsi":      sell_rsi,
                "holding_days":  (row['date'] - buy_date).days,
                "pnl_per_share": round(sell_price - buy_price, 2),
                "pnl_100shares": round((sell_price - buy_price) * 100, 2),
                "return_pct":    round(pnl_pct, 2),
                "result":        "WIN" if pnl_pct > 0 else "LOSS"
            })
            in_trade = False

    open_trade = None
    if in_trade:
        last = df.iloc[-1]
        cur  = float(last['close'])
        open_trade = {
            "buy_date":       str(buy_date.date()),
            "buy_price":      round(buy_price, 2),
            "current_price":  round(cur, 2),
            "current_rsi":    round(float(last.get('RSI_14', np.nan)), 1) if not pd.isna(last.get('RSI_14', np.nan)) else None,
            "holding_days":   (last['date'] - buy_date).days,
            "unrealised_pnl": round((cur - buy_price) * 100, 2),
            "return_pct":     round((cur - buy_price) / buy_price * 100, 2)
        }
    return trades, open_trade


def _run_simple(df, buy_expr):
    buy_sig = _eval_safe(buy_expr, df)
    df = df.copy()
    df['_fwd'] = df['close'].pct_change().shift(-1) * 100

    trades = []
    for i in df[buy_sig].index:
        if i + 1 >= len(df): continue
        row  = df.iloc[i]
        nrow = df.iloc[i + 1]
        pnl  = (float(nrow['close']) - float(row['close'])) / float(row['close']) * 100
        rsi  = round(float(row.get('RSI_14', np.nan)), 1) if not pd.isna(row.get('RSI_14', np.nan)) else None
        trades.append({
            "buy_date":      str(row['date'].date()),
            "buy_price":     round(float(row['close']), 2),
            "buy_rsi":       rsi,
            "sell_date":     str(nrow['date'].date()),
            "sell_price":    round(float(nrow['close']), 2),
            "sell_rsi":      None,
            "holding_days":  1,
            "pnl_per_share": round(float(nrow['close']) - float(row['close']), 2),
            "pnl_100shares": round((float(nrow['close']) - float(row['close'])) * 100, 2),
            "return_pct":    round(pnl, 2),
            "result":        "WIN" if pnl > 0 else "LOSS"
        })
    return trades, None


# ── Step 5: Summary stats ─────────────────────────────────────────────────────
def _summary(trades):
    if not trades:
        return None
    td      = pd.DataFrame(trades)
    total   = len(td)
    wins    = int((td['return_pct'] > 0).sum())
    losses  = total - wins
    returns = td['return_pct'] / 100
    cum     = (1 + returns).cumprod()
    peak    = cum.cummax()
    dd      = ((cum - peak) / peak * 100).min()

    avg_win  = round(td[td['result']=='WIN']['return_pct'].mean(),  2) if wins   else 0.0
    avg_loss = round(td[td['result']=='LOSS']['return_pct'].mean(), 2) if losses else 0.0
    rr       = round(abs(avg_win / avg_loss), 2) if avg_loss != 0 else 0.0

    win_pnl  = td[td['result']=='WIN']['pnl_100shares'].sum()
    loss_pnl = abs(td[td['result']=='LOSS']['pnl_100shares'].sum())
    pf       = round(win_pnl / loss_pnl, 2) if loss_pnl > 0 else 999.0

    return {
        "total_trades":             total,
        "wins":                     wins,
        "losses":                   losses,
        "win_rate":                 round(wins / total * 100, 2),
        "total_pnl_100shares":      round(td['pnl_100shares'].sum(), 2),
        "avg_pnl_per_trade":        round(td['pnl_100shares'].mean(), 2),
        "avg_return_per_trade_pct": round(td['return_pct'].mean(), 2),
        "total_return_pct":         round(((1 + returns).prod() - 1) * 100, 2),
        "best_trade_pct":           round(td['return_pct'].max(), 2),
        "worst_trade_pct":          round(td['return_pct'].min(), 2),
        "avg_win_pct":              avg_win,
        "avg_loss_pct":             avg_loss,
        "risk_reward_ratio":        rr,
        "avg_holding_days":         round(td['holding_days'].mean(), 1),
        "max_drawdown_pct":         round(dd, 2),
        "profit_factor":            pf,
    }


# ── Step 6: Main entry ────────────────────────────────────────────────────────
def run_custom_backtest(df: pd.DataFrame, user_prompt: str):
    try:
        df = _prepare_df(df)

        # Detect indicator for chart
        p = user_prompt.lower()
        indicator_col = (
            'RSI_14'      if 'rsi'     in p else
            'MACD'        if 'macd'    in p else
            'MACD_hist'   if 'hist'    in p else
            'SMA_50'      if 'sma'     in p or 'golden' in p or 'death' in p else
            'BB_width'    if 'bolling' in p else
            'vol_ratio'   if 'volume'  in p else
            'day_return'  if 'day'     in p or 'return' in p else
            'week_return' if 'week'    in p else
            None
        )

        # Try rule engine first (instant, no API)
        strategy = _rule_engine_fallback(user_prompt)

        # Fall back to LLM if no rule matched
        if not strategy:
            strategy = translate_strategy(user_prompt)

        buy_expr  = strategy.get("buy_expr", "")
        sell_expr = strategy.get("sell_expr", "")
        mode      = strategy.get("mode", "crossover")

        print(f"[Backtest] buy_expr:  {buy_expr}")
        print(f"[Backtest] sell_expr: {sell_expr}")
        print(f"[Backtest] mode:      {mode}")

        # Run simulation
        try:
            if mode == "crossover":
                trades, open_trade = _run_crossover(df, buy_expr, sell_expr)
            else:
                trades, open_trade = _run_simple(df, buy_expr)
        except Exception as e:
            print(f"[Backtest] Simulation failed: {e}, trying simple mode")
            trades, open_trade = _run_simple(df, buy_expr)

        # If still no trades, try flipping to simple mode
        if not trades and not open_trade and mode == "crossover":
            print("[Backtest] No crossover trades, falling back to simple mode")
            try:
                trades, open_trade = _run_simple(df, buy_expr)
            except Exception:
                pass

        summary = _summary(trades)

        # Current signal
        try:
            bs = _eval_safe(buy_expr,  df)
            ss = _eval_safe(sell_expr, df)
            current_signal = "BUY" if bool(bs.iloc[-1]) else "SELL" if bool(ss.iloc[-1]) else "HOLD"
        except Exception:
            current_signal = "HOLD"

        # Build chart data
        price_series = [
            {"date": str(r['date'].date()), "close": round(float(r['close']), 2)}
            for _, r in df.iterrows()
        ]
        indicator_series = []
        if indicator_col and indicator_col in df.columns:
            indicator_series = [
                {"date": str(r['date'].date()), "value": round(float(r[indicator_col]), 2)}
                for _, r in df.iterrows()
                if not pd.isna(r[indicator_col])
            ]

        buy_markers  = [{"date": t["buy_date"],  "price": t["buy_price"],  "type": "buy"}  for t in trades]
        sell_markers = [{"date": t["sell_date"], "price": t["sell_price"], "type": "sell"} for t in trades]

        result = {
            "success":        True,
            "prompt":         user_prompt,
            "buy_expr":       buy_expr,
            "sell_expr":      sell_expr,
            "mode":           mode,
            "current_signal": current_signal,
            "summary":        summary,
            "trades":         trades[-30:],
            "open_trade":     open_trade,
            "chart_data": {
                "price":     price_series,
                "indicator": indicator_series,
                "markers":   buy_markers + sell_markers,
            },
            # flat fields for backward compat
            "total_trades":             summary["total_trades"]             if summary else 0,
            "win_rate":                 summary["win_rate"]                 if summary else 0,
            "avg_return_per_trade_pct": summary["avg_return_per_trade_pct"] if summary else 0,
            "total_return_pct":         summary["total_return_pct"]         if summary else 0,
        }

        if not trades and not open_trade:
            result["warning"] = (
                "No trades triggered. The condition may be too strict for this stock's "
                "price history. Try a less restrictive threshold or a different stock."
            )

        return result

    except Exception as e:
        return {
            "error": f"Could not run backtest. Try rephrasing — e.g. 'RSI crosses above 30' or 'buy when MACD bullish crossover'. Detail: {str(e)}"
        }
