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

default_origins = [
    "https://bullseye-analytics-ai.vercel.app",
    "https://ai-trading-mvp.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://192.168.137.1:3000",
    "http://192.168.137.1:3001",
]
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", ",".join(default_origins)).split(",")
    if origin.strip()
]

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="AI Trading Assistant - MVP")
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.services.data_service import get_latest_quote, get_historical_data, get_fundamentals_data, get_chart_data
from app.strategies.engine import run_analysis, evaluate_strategies
from app.strategies.nlp_backtester import run_custom_backtest
from app.strategies.strategy_selector import TOP_20_STRATEGIES, get_strategy_prediction, get_best_strategy


def analyze_ticker_sync(ticker: str):
    df = get_historical_data(ticker)
    return run_analysis(df, ticker)


@app.get("/health")
async def health():
    return {"status": "Backend is running"}


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
async def chart(request: Request, ticker: str, range: str = "1y"):
    try:
        df = get_chart_data(ticker, range)
        return df.to_dict(orient="records")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/v1/analyze/{ticker}")
@limiter.limit("3/minute")
async def analyze(request: Request, ticker: str):
    try:
        return analyze_ticker_sync(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/v1/analyze/batch")
@limiter.limit("10/minute")
async def analyze_batch(request: Request, tickers: str):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="No tickers provided")
    if len(ticker_list) > 24:
        raise HTTPException(status_code=400, detail="Max 24 tickers per batch")

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=min(len(ticker_list), 6)) as executor:
        tasks = [loop.run_in_executor(executor, analyze_ticker_sync, ticker) for ticker in ticker_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    payload = {}
    for ticker, result in zip(ticker_list, results):
        if isinstance(result, Exception):
            payload[ticker] = {"error": str(result)}
        else:
            payload[ticker] = result
    return payload


@app.get("/api/v1/fundamentals/{ticker}")
@limiter.limit("5/minute")
async def fundamentals(request: Request, ticker: str):
    try:
        return get_fundamentals_data(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        ranked_strategies = sorted(
            [
                {"id": strategy_id, **strategy}
                for strategy_id, strategy in all_strategies.items()
            ],
            key=lambda item: item.get("score", 0),
            reverse=True,
        )
        return {
            "custom_metrics": custom_result,
            "top_20": ranked_strategies[:20],
            "best_strategy_id": best_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


print("FastAPI started - visit http://localhost:8000/health")
