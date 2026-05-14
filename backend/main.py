from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from dotenv import load_dotenv
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
# =====================================================================

print("✅ FastAPI started - visit http://localhost:8000/health")