from __future__ import annotations

import os
from datetime import time


DEFAULT_CONSENT_VERSION = os.getenv("NOTIFICATION_CONSENT_VERSION", "2026-05-29")
DEFAULT_MARKET = os.getenv("DEFAULT_SIGNAL_MARKET", "NSE").upper()
DEFAULT_RISK_LEVEL = os.getenv("DEFAULT_SIGNAL_RISK_LEVEL", "Balanced")
DEFAULT_SIGNAL_TYPE = os.getenv("DEFAULT_SIGNAL_TYPE", "Next-day swing")
DEFAULT_EMAIL_TIME = os.getenv("DEFAULT_SIGNAL_EMAIL_TIME", "18:00")

MIN_EMAIL_AFTER_CLOSE_MINUTES = int(os.getenv("MIN_EMAIL_AFTER_CLOSE_MINUTES", "30"))
MIN_HISTORY_DAYS = int(os.getenv("MIN_SIGNAL_HISTORY_DAYS", "140"))
MAX_SELECTED_SIGNALS = int(os.getenv("MAX_SELECTED_SIGNALS", "10"))
CORRELATION_LOOKBACK = int(os.getenv("SIGNAL_CORRELATION_LOOKBACK", "60"))
CORRELATION_THRESHOLD = float(os.getenv("SIGNAL_CORRELATION_THRESHOLD", "0.92"))
DEFAULT_K_SMOOTHING = int(os.getenv("ADJUSTED_WIN_RATE_K", "20"))
UNIVERSE_AVERAGE_WIN_RATE = float(os.getenv("UNIVERSE_AVG_WIN_RATE", "0.52"))

MARKET_CLOSES = {
    "NSE": time(15, 30),
    "BSE": time(15, 30),
    "US": time(16, 0),
}

RISK_PROFILES = {
    "Conservative": {
        "confidence_threshold": 0.61,
        "min_risk_reward": 1.4,
        "target_atr_multiplier": 0.85,
        "stop_atr_multiplier": 0.55,
        "max_atr_pct": 5.0,
        "risk_penalty_multiplier": 1.1,
    },
    "Balanced": {
        "confidence_threshold": 0.58,
        "min_risk_reward": 1.25,
        "target_atr_multiplier": 1.0,
        "stop_atr_multiplier": 0.72,
        "max_atr_pct": 6.4,
        "risk_penalty_multiplier": 1.0,
    },
    "Aggressive": {
        "confidence_threshold": 0.55,
        "min_risk_reward": 1.2,
        "target_atr_multiplier": 1.18,
        "stop_atr_multiplier": 0.82,
        "max_atr_pct": 7.2,
        "risk_penalty_multiplier": 0.9,
    },
}

NSE_UNIVERSE = [
    "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "AXISBANK.NS", "KOTAKBANK.NS",
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS",
    "LT.NS", "BHARTIARTL.NS", "ITC.NS", "HINDUNILVR.NS", "NESTLEIND.NS",
    "TATAMOTORS.NS", "MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS",
    "SUNPHARMA.NS", "CIPLA.NS", "DRREDDY.NS", "DIVISLAB.NS", "APOLLOHOSP.NS",
    "TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS", "VEDL.NS", "COALINDIA.NS",
    "NTPC.NS", "POWERGRID.NS", "ONGC.NS", "BPCL.NS", "TATAPOWER.NS",
    "ULTRACEMCO.NS", "GRASIM.NS", "AMBUJACEM.NS", "SHREECEM.NS", "ADANIENT.NS",
    "ADANIPORTS.NS", "ASIANPAINT.NS", "TITAN.NS", "DMART.NS", "TRENT.NS",
    "BAJFINANCE.NS", "BAJAJFINSV.NS", "SHRIRAMFIN.NS", "CHOLAFIN.NS", "PFC.NS",
    "RECLTD.NS", "FEDERALBNK.NS", "BANKBARODA.NS", "CANBK.NS", "PNB.NS",
    "TECHM.NS", "LTIM.NS", "COFORGE.NS", "PERSISTENT.NS", "MPHASIS.NS",
    "BRITANNIA.NS", "TATACONSUM.NS", "DABUR.NS", "MARICO.NS", "VBL.NS",
    "LUPIN.NS", "TORNTPHARM.NS", "ZYDUSLIFE.NS", "AUROPHARMA.NS", "BIOCON.NS",
    "INDIGO.NS", "IRCTC.NS", "ZOMATO.NS", "PAYTM.NS", "NYKAA.NS",
    "BEL.NS", "HAL.NS", "BHEL.NS", "SIEMENS.NS", "ABB.NS",
]

US_UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL",
    "META", "TSLA", "AMD", "AVGO", "JPM",
    "LLY", "NFLX", "COST", "UBER", "CRM",
]

MARKET_UNIVERSES = {
    "NSE": NSE_UNIVERSE,
    "BSE": NSE_UNIVERSE,
    "US": US_UNIVERSE,
}

MARKET_INDEX = {
    "NSE": "^NSEI",
    "BSE": "^BSESN",
    "US": "^GSPC",
}

SECTOR_BY_SYMBOL = {
    "HDFCBANK": "Financials",
    "ICICIBANK": "Financials",
    "SBIN": "Financials",
    "AXISBANK": "Financials",
    "KOTAKBANK": "Financials",
    "RELIANCE": "Energy",
    "TCS": "Technology",
    "INFY": "Technology",
    "HCLTECH": "Technology",
    "WIPRO": "Technology",
    "LT": "Industrials",
    "BHARTIARTL": "Telecom",
    "ITC": "Consumer Defensive",
    "HINDUNILVR": "Consumer Defensive",
    "NESTLEIND": "Consumer Defensive",
    "TATAMOTORS": "Automotive",
    "MARUTI": "Automotive",
    "M&M": "Automotive",
    "BAJAJ-AUTO": "Automotive",
    "EICHERMOT": "Automotive",
    "SUNPHARMA": "Healthcare",
    "CIPLA": "Healthcare",
    "DRREDDY": "Healthcare",
    "DIVISLAB": "Healthcare",
    "APOLLOHOSP": "Healthcare",
    "TATASTEEL": "Materials",
    "JSWSTEEL": "Materials",
    "HINDALCO": "Materials",
    "VEDL": "Materials",
    "COALINDIA": "Energy",
    "NTPC": "Utilities",
    "POWERGRID": "Utilities",
    "ONGC": "Energy",
    "BPCL": "Energy",
    "TATAPOWER": "Utilities",
    "ULTRACEMCO": "Materials",
    "GRASIM": "Materials",
    "AMBUJACEM": "Materials",
    "SHREECEM": "Materials",
    "ADANIENT": "Industrials",
    "ADANIPORTS": "Industrials",
    "ASIANPAINT": "Consumer Cyclical",
    "TITAN": "Consumer Cyclical",
    "DMART": "Consumer Defensive",
    "TRENT": "Consumer Cyclical",
    "BAJFINANCE": "Financials",
    "BAJAJFINSV": "Financials",
    "SHRIRAMFIN": "Financials",
    "CHOLAFIN": "Financials",
    "PFC": "Financials",
    "RECLTD": "Financials",
    "FEDERALBNK": "Financials",
    "BANKBARODA": "Financials",
    "CANBK": "Financials",
    "PNB": "Financials",
    "TECHM": "Technology",
    "LTIM": "Technology",
    "COFORGE": "Technology",
    "PERSISTENT": "Technology",
    "MPHASIS": "Technology",
    "BRITANNIA": "Consumer Defensive",
    "TATACONSUM": "Consumer Defensive",
    "DABUR": "Consumer Defensive",
    "MARICO": "Consumer Defensive",
    "VBL": "Consumer Defensive",
    "LUPIN": "Healthcare",
    "TORNTPHARM": "Healthcare",
    "ZYDUSLIFE": "Healthcare",
    "AUROPHARMA": "Healthcare",
    "BIOCON": "Healthcare",
    "INDIGO": "Industrials",
    "IRCTC": "Consumer Cyclical",
    "ZOMATO": "Consumer Cyclical",
    "PAYTM": "Technology",
    "NYKAA": "Consumer Cyclical",
    "BEL": "Industrials",
    "HAL": "Industrials",
    "BHEL": "Industrials",
    "SIEMENS": "Industrials",
    "ABB": "Industrials",
    "AAPL": "Technology",
    "MSFT": "Technology",
    "NVDA": "Technology",
    "AMZN": "Consumer Cyclical",
    "GOOGL": "Communication Services",
    "META": "Communication Services",
    "TSLA": "Automotive",
    "AMD": "Technology",
    "AVGO": "Technology",
    "JPM": "Financials",
    "LLY": "Healthcare",
    "NFLX": "Communication Services",
    "COST": "Consumer Defensive",
    "UBER": "Industrials",
    "CRM": "Technology",
}

COMPANY_NAME_BY_SYMBOL = {
    symbol: symbol.replace("-", " ")
    for symbol in SECTOR_BY_SYMBOL
}
