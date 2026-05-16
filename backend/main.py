from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from dotenv import load_dotenv
from pydantic import BaseModel
import asyncio
from concurrent.futures import ThreadPoolExecutor
import os

load_dotenv()

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="AI Trading Assistant - MVP")
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ai-trading-mvp.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.services.data_service import get_latest_quote, get_historical_data
from app.strategies.engine import run_analysis, evaluate_strategies
from app.strategies.nlp_backtester import run_custom_backtest
from app.strategies.strategy_selector import TOP_20_STRATEGIES, get_strategy_prediction, get_best_strategy


@app.get("/health")
async def health():
    return {"status": "✅ Backend is running!"}


@app.get("/api/v1/quote/{ticker}")
@limiter.limit("30/minute")
async def quote(request: Request, ticker: str):
    return get_latest_quote(ticker)


@app.get("/api/v1/quotes/batch")
@limiter.limit("20/minute")
async def batch_quotes(request: Request, tickers: str):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="No tickers provided")
    if len(ticker_list) > 20:
        raise HTTPException(status_code=400, detail="Max 20 tickers per batch")
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=len(ticker_list)) as executor:
        tasks = [loop.run_in_executor(executor, get_latest_quote, t) for t in ticker_list]
        results = await asyncio.gather(*tasks)
    return {ticker: result for ticker, result in zip(ticker_list, results)}


@app.get("/api/v1/chart/{ticker}")
@limiter.limit("5/minute")
async def chart(request: Request, ticker: str):
    try:
        df = get_historical_data(ticker)
        return df.to_dict(orient="records")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/v1/analyze/{ticker}")
@limiter.limit("3/minute")
async def analyze(request: Request, ticker: str):
    try:
        df = get_historical_data(ticker)
        result = run_analysis(df, ticker)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/v1/strategies/list")
async def get_strategies():
    return {"strategies": TOP_20_STRATEGIES}


@app.get("/api/v1/strategy/{ticker}/{strategy_name}")
@limiter.limit("5/minute")
async def strategy_analysis(request: Request, ticker: str, strategy_name: str):
    df = get_historical_data(ticker)
    selected = get_strategy_prediction(df, strategy_name, ticker)
    best = get_best_strategy(df, ticker)
    return {"selected_strategy": selected, "best_strategy": best}


class BacktestRequest(BaseModel):
    ticker: str
    prompt: str


class ChatRequest(BaseModel):
    ticker: str
    message: str


@app.post("/api/v1/chat")
@limiter.limit("20/minute")
async def ai_chat(request: Request, body: ChatRequest):
    try:
        from app.strategies.nlp_backtester import run_custom_backtest, get_client
        import re, json

        ticker  = body.ticker
        message = body.message.strip()

        # Step 1: classify intent
        classify_prompt = f"""
Classify this user message into ONE intent:
- "price_query"  → asking about price on a specific date
- "backtest"     → wants to test a trading strategy
- "general"      → anything else

User message: "{message}"
Ticker: {ticker}

Reply ONLY with JSON: {{"intent": "...", "date": "YYYY-MM-DD or null"}}
"""
        groq_client = get_client()
        cls_resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": classify_prompt}],
            temperature=0.0,
        )
        raw_cls = cls_resp.choices[0].message.content.strip()
        raw_cls = re.sub(r"```[\w]*", "", raw_cls).replace("```", "").strip()
        try:
            cls = json.loads(raw_cls)
        except Exception:
            m = re.search(r'\{[^}]+\}', raw_cls)
            cls = json.loads(m.group()) if m else {"intent": "backtest"}

        intent = cls.get("intent", "backtest")

        # Step 2: price query
        if intent == "price_query":
            df = get_historical_data(ticker)
            df['date'] = pd.to_datetime(df['date'])
            date_str = cls.get("date")

            if not date_str or date_str == "null":
                date_resp = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": f"Extract date from: '{message}'. Return ONLY YYYY-MM-DD or null."}],
                    temperature=0.0,
                )
                date_str = date_resp.choices[0].message.content.strip()

            try:
                target = pd.to_datetime(date_str)
                row = df[df['date'].dt.date == target.date()]
            except Exception:
                row = pd.DataFrame()

            if not row.empty:
                r = row.iloc[0]
                return {
                    "type": "price_query", "found": True, "ticker": ticker,
                    "date": str(r['date'].date()),
                    "open":   round(float(r['open']),  2),
                    "high":   round(float(r['high']),  2),
                    "low":    round(float(r['low']),   2),
                    "close":  round(float(r['close']), 2),
                    "volume": int(r['volume']),
                }
            else:
                if date_str and date_str != "null":
                    try:
                        target = pd.to_datetime(date_str)
                        df['_diff'] = abs(df['date'] - target)
                        nearest = df.loc[df['_diff'].idxmin()]
                        return {
                            "type": "price_query", "found": False, "ticker": ticker,
                            "message": f"No data for that exact date (holiday/weekend). Nearest trading day: {str(nearest['date'].date())} — Close ₹{round(float(nearest['close']),2)}"
                        }
                    except Exception:
                        pass
                return {"type": "price_query", "found": False, "message": "Could not find price data for that date."}

        # Step 3: backtest
        elif intent == "backtest":
            df = get_historical_data(ticker)
            result = run_custom_backtest(df, message)
            result["type"] = "backtest"
            return result

        # Step 4: general AI answer
        else:
            df = get_historical_data(ticker)
            import ta
            df.columns = [c.lower() for c in df.columns]
            close  = df['close']
            rsi    = ta.momentum.rsi(close, window=14).iloc[-1]
            sma50  = close.rolling(50).mean().iloc[-1]
            sma200 = close.rolling(200).mean().iloc[-1]
            cur    = float(close.iloc[-1])

            gen_resp = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": f"You are SignalX, an AI trading assistant.\nStock: {ticker} | Price: ₹{round(cur,2)} | RSI: {round(rsi,1)} | SMA50: ₹{round(sma50,2)} | SMA200: ₹{round(sma200,2)}\nAnswer concisely and helpfully."},
                    {"role": "user", "content": message}
                ],
                temperature=0.3, max_tokens=400,
            )
            return {"type": "general", "message": gen_resp.choices[0].message.content.strip()}

    except Exception as e:
        return {"type": "error", "message": f"Something went wrong: {str(e)}"}


@app.post("/api/v1/backtest/custom")
@limiter.limit("10/minute")
async def custom_backtest(request: Request, body: BacktestRequest):
    try:
        df = get_historical_data(body.ticker)
        custom_result = run_custom_backtest(df, body.prompt)
        import ta
        df['SMA_50']      = ta.trend.sma_indicator(df['close'], window=50)
        df['SMA_200']     = ta.trend.sma_indicator(df['close'], window=200)
        df['EMA_20']      = ta.trend.ema_indicator(df['close'], window=20)
        df['EMA_50']      = ta.trend.ema_indicator(df['close'], window=50)
        df['RSI_14']      = ta.momentum.rsi(df['close'], window=14)
        df['MACD']        = ta.trend.macd(df['close'])
        df['MACD_signal'] = ta.trend.macd_signal(df['close'])
        df['VWAP']        = ta.volume.volume_weighted_average_price(df['high'], df['low'], df['close'], df['volume'], window=14)
        df['VOL_SMA_20']  = df['volume'].rolling(window=20).mean()
        df['ATR_14']      = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
        df['BBU_14_2.0']  = ta.volatility.bollinger_hband(df['close'], window=14, window_dev=2)
        df['BBL_14_2.0']  = ta.volatility.bollinger_lband(df['close'], window=14, window_dev=2)
        df = df.dropna()
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        all_strategies, best_id = evaluate_strategies(latest, prev, df)
        return {"custom_metrics": custom_result, "top_20": all_strategies[:20]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


print("✅ FastAPI started - visit http://localhost:8000/health")
