from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from dotenv import load_dotenv
from pydantic import BaseModel
from app.strategies.nlp_backtester import run_custom_backtest
import os
load_dotenv()

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="AI Trading Assistant - MVP")
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ai-trading-mvp.vercel.app"],   # your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import existing services
from app.services.data_service import get_latest_quote, get_historical_data
from app.strategies.engine import run_analysis

# NEW: Import Strategy Explorer
from app.strategies.strategy_selector import TOP_20_STRATEGIES, get_strategy_prediction, get_best_strategy

@app.get("/health")
async def health():
    return {"status": "✅ Backend is running!"}

@app.get("/api/v1/quote/{ticker}")
@limiter.limit("10/minute")
async def quote(request: Request, ticker: str):
    return get_latest_quote(ticker)

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

# ====================== NEW STRATEGY EXPLORER ROUTES ======================
@app.get("/api/v1/strategies/list")
async def get_strategies():
    """Returns the list of Top 20 strategies for the dropdown"""
    return {"strategies": TOP_20_STRATEGIES}

@app.get("/api/v1/strategy/{ticker}/{strategy_name}")
@limiter.limit("5/minute")
async def strategy_analysis(request: Request, ticker: str, strategy_name: str):
    """Returns prediction for selected strategy + AI's best strategy"""
    df = get_historical_data(ticker)
    selected = get_strategy_prediction(df, strategy_name, ticker)
    best = get_best_strategy(df, ticker)
    return {
        "selected_strategy": selected,
        "best_strategy": best
    }
class BacktestRequest(BaseModel):
    ticker: str
    prompt: str

from pydantic import BaseModel
from app.strategies.nlp_backtester import run_custom_backtest
from app.strategies.engine import evaluate_strategies

class BacktestRequest(BaseModel):
    ticker: str
    prompt: str

@app.post("/api/v1/backtest/custom")
@limiter.limit("10/minute")
async def custom_backtest(request: Request, body: BacktestRequest):
    try:
        df = get_historical_data(body.ticker) 
        
        # 1. Evaluate custom prompt (If user types "find best strategy", this safely returns an error but doesn't crash)
        custom_result = run_custom_backtest(df, body.prompt)
        
        # 2. Add indicators required for the predefined strategies
        import ta
        df['SMA_50']  = ta.trend.sma_indicator(df['close'], window=50)
        df['SMA_200'] = ta.trend.sma_indicator(df['close'], window=200)
        df['EMA_20']  = ta.trend.ema_indicator(df['close'], window=20)
        df['EMA_50']  = ta.trend.ema_indicator(df['close'], window=50)
        df['RSI_14']  = ta.momentum.rsi(df['close'], window=14)
        df['MACD']    = ta.trend.macd(df['close'])
        df['MACD_signal'] = ta.trend.macd_signal(df['close'])
        df['VWAP'] = ta.volume.volume_weighted_average_price(df['high'], df['low'], df['close'], df['volume'], window=14)
        df['VOL_SMA_20'] = df['volume'].rolling(window=20).mean()
        df['ATR_14']  = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
        df['BBU_14_2.0'] = ta.volatility.bollinger_hband(df['close'], window=14, window_dev=2)
        df['BBL_14_2.0'] = ta.volatility.bollinger_lband(df['close'], window=14, window_dev=2)
        df = df.dropna()

        # 3. Get all strategies and slice top 20
        latest = df.iloc[-1]
        prev = df.iloc[-2]
        all_strategies, best_id = evaluate_strategies(latest, prev, df)
        top_20 = all_strategies[:20]

        return {
            "custom_metrics": custom_result,
            "top_20": top_20
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

print("✅ FastAPI started - visit http://localhost:8000/health")