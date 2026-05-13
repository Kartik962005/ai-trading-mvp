from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from dotenv import load_dotenv
import os

load_dotenv()  # reads your .env file

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="AI Trading Assistant - MVP")
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # will restrict this after deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "✅ Backend is running!"}
from app.services.data_service import get_latest_quote, get_historical_data

@app.get("/api/v1/quote/{ticker}")
@limiter.limit("10/minute")
async def quote(request: Request, ticker: str):
    return get_latest_quote(ticker)

@app.get("/api/v1/chart/{ticker}")
@limiter.limit("5/minute")
async def chart(request: Request, ticker: str):
    df = get_historical_data(ticker)
    return df.to_dict(orient="records")

from app.strategies.engine import run_analysis

@app.get("/api/v1/analyze/{ticker}")
@limiter.limit("3/minute")
async def analyze(request: Request, ticker: str):
    df = get_historical_data(ticker)
    result = run_analysis(df, ticker)
    return result
print("✅ FastAPI started - visit http://localhost:8000/health")