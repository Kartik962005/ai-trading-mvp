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
MAX_SIGNALS_PER_SECTOR = int(os.getenv("MAX_SIGNALS_PER_SECTOR", "3"))
# When false (default), signals are NEVER generated from synthetic/mock prices —
# tickers whose live data cannot be fetched are skipped instead of fabricated.
# Set DAILY_SIGNAL_ALLOW_MOCK=true only for offline demos.
ALLOW_MOCK_SIGNAL_DATA = os.getenv("DAILY_SIGNAL_ALLOW_MOCK", "false").strip().lower() in {"1", "true", "yes"}
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

# NOTE: keep this list to symbols that are CURRENTLY listed and actively traded.
# Delisted / renamed / demerged symbols (e.g. old "TATAMOTORS" pre-demerger, the
# now-invalid "LTIM") must be removed — otherwise the data layer can serve stale
# cached or synthetic prices for a name that no longer trades. New picks are only
# emitted from real live data (see ALLOW_MOCK_SIGNAL_DATA), so a wrong symbol here
# is also skipped at runtime, but it should still be pruned from this list.
NSE_UNIVERSE = [
    # Banks & financials
    "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "AXISBANK.NS", "KOTAKBANK.NS",
    "INDUSINDBK.NS", "IDFCFIRSTB.NS", "AUBANK.NS", "FEDERALBNK.NS", "BANKBARODA.NS",
    "CANBK.NS", "PNB.NS", "BAJFINANCE.NS", "BAJAJFINSV.NS", "BAJAJHLDNG.NS",
    "SHRIRAMFIN.NS", "CHOLAFIN.NS", "MUTHOOTFIN.NS", "SBICARD.NS", "PFC.NS",
    "RECLTD.NS", "IRFC.NS", "LICI.NS", "HDFCLIFE.NS", "SBILIFE.NS",
    "ICICIPRULI.NS", "ICICIGI.NS", "POLICYBZR.NS",
    # IT & technology
    "TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS",
    "COFORGE.NS", "PERSISTENT.NS", "MPHASIS.NS", "OFSS.NS", "PAYTM.NS",
    "DIXON.NS",
    # Energy & utilities
    "RELIANCE.NS", "ONGC.NS", "COALINDIA.NS", "BPCL.NS", "IOC.NS",
    "HINDPETRO.NS", "GAIL.NS", "PETRONET.NS", "NTPC.NS", "POWERGRID.NS",
    "TATAPOWER.NS", "TORNTPOWER.NS", "JSWENERGY.NS", "NHPC.NS", "ADANIPOWER.NS",
    "ADANIGREEN.NS", "IGL.NS",
    # Industrials & capital goods
    "LT.NS", "SIEMENS.NS", "ABB.NS", "BEL.NS", "HAL.NS",
    "BHEL.NS", "CUMMINSIND.NS", "THERMAX.NS", "POLYCAB.NS", "KEI.NS",
    "CONCOR.NS", "MAZDOCK.NS", "RVNL.NS", "BDL.NS", "SOLARINDS.NS",
    "ADANIENT.NS", "ADANIPORTS.NS", "INDIGO.NS", "DELHIVERY.NS",
    # Autos & ancillaries
    "MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS", "HEROMOTOCO.NS",
    "TVSMOTOR.NS", "ASHOKLEY.NS", "BOSCHLTD.NS", "MOTHERSON.NS", "MRF.NS",
    "BALKRISIND.NS",
    # Pharma & healthcare
    "SUNPHARMA.NS", "CIPLA.NS", "DRREDDY.NS", "DIVISLAB.NS", "APOLLOHOSP.NS",
    "LUPIN.NS", "TORNTPHARM.NS", "ZYDUSLIFE.NS", "AUROPHARMA.NS", "BIOCON.NS",
    "ALKEM.NS", "GLENMARK.NS", "LAURUSLABS.NS", "MAXHEALTH.NS", "FORTIS.NS",
    "LALPATHLAB.NS",
    # Metals & materials
    "TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS", "VEDL.NS", "JINDALSTEL.NS",
    "SAIL.NS", "NMDC.NS", "ULTRACEMCO.NS", "GRASIM.NS", "AMBUJACEM.NS",
    "SHREECEM.NS", "ACC.NS", "DALBHARAT.NS", "APLAPOLLO.NS",
    # Chemicals & agri-inputs
    "SRF.NS", "PIIND.NS", "UPL.NS", "COROMANDEL.NS", "TATACHEM.NS",
    "PIDILITIND.NS", "ASIANPAINT.NS", "BERGEPAINT.NS",
    # Consumer & retail
    "ITC.NS", "HINDUNILVR.NS", "NESTLEIND.NS", "BRITANNIA.NS", "TATACONSUM.NS",
    "DABUR.NS", "MARICO.NS", "VBL.NS", "GODREJCP.NS", "COLPAL.NS",
    "UBL.NS", "PGHH.NS", "TITAN.NS", "DMART.NS", "TRENT.NS",
    "HAVELLS.NS", "VOLTAS.NS", "CROMPTON.NS", "PAGEIND.NS", "BATAINDIA.NS",
    "ABFRL.NS", "JUBLFOOD.NS", "NYKAA.NS", "ZOMATO.NS", "IRCTC.NS",
    # Realty
    "DLF.NS", "GODREJPROP.NS", "OBEROIRLTY.NS", "PRESTIGE.NS",
    # Telecom & media
    "BHARTIARTL.NS", "INDUSTOWER.NS", "SUNTV.NS", "PVRINOX.NS", "NAUKRI.NS",
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
    "INDUSINDBK": "Financials",
    "IDFCFIRSTB": "Financials",
    "AUBANK": "Financials",
    "BAJAJHLDNG": "Financials",
    "MUTHOOTFIN": "Financials",
    "SBICARD": "Financials",
    "IRFC": "Financials",
    "LICI": "Financials",
    "HDFCLIFE": "Financials",
    "SBILIFE": "Financials",
    "ICICIPRULI": "Financials",
    "ICICIGI": "Financials",
    "POLICYBZR": "Financials",
    "OFSS": "Technology",
    "DIXON": "Technology",
    "IOC": "Energy",
    "HINDPETRO": "Energy",
    "GAIL": "Energy",
    "PETRONET": "Energy",
    "TORNTPOWER": "Utilities",
    "JSWENERGY": "Utilities",
    "NHPC": "Utilities",
    "ADANIPOWER": "Utilities",
    "ADANIGREEN": "Utilities",
    "IGL": "Utilities",
    "CUMMINSIND": "Industrials",
    "THERMAX": "Industrials",
    "POLYCAB": "Industrials",
    "KEI": "Industrials",
    "CONCOR": "Industrials",
    "MAZDOCK": "Industrials",
    "RVNL": "Industrials",
    "BDL": "Industrials",
    "SOLARINDS": "Industrials",
    "DELHIVERY": "Industrials",
    "HEROMOTOCO": "Automotive",
    "TVSMOTOR": "Automotive",
    "ASHOKLEY": "Automotive",
    "BOSCHLTD": "Automotive",
    "MOTHERSON": "Automotive",
    "MRF": "Automotive",
    "BALKRISIND": "Automotive",
    "ALKEM": "Healthcare",
    "GLENMARK": "Healthcare",
    "LAURUSLABS": "Healthcare",
    "MAXHEALTH": "Healthcare",
    "FORTIS": "Healthcare",
    "LALPATHLAB": "Healthcare",
    "JINDALSTEL": "Materials",
    "SAIL": "Materials",
    "NMDC": "Materials",
    "ACC": "Materials",
    "DALBHARAT": "Materials",
    "APLAPOLLO": "Materials",
    "SRF": "Materials",
    "PIIND": "Materials",
    "UPL": "Materials",
    "COROMANDEL": "Materials",
    "TATACHEM": "Materials",
    "PIDILITIND": "Materials",
    "BERGEPAINT": "Consumer Cyclical",
    "GODREJCP": "Consumer Defensive",
    "COLPAL": "Consumer Defensive",
    "UBL": "Consumer Defensive",
    "PGHH": "Consumer Defensive",
    "HAVELLS": "Consumer Cyclical",
    "VOLTAS": "Consumer Cyclical",
    "CROMPTON": "Consumer Cyclical",
    "PAGEIND": "Consumer Cyclical",
    "BATAINDIA": "Consumer Cyclical",
    "ABFRL": "Consumer Cyclical",
    "JUBLFOOD": "Consumer Cyclical",
    "DLF": "Consumer Cyclical",
    "GODREJPROP": "Consumer Cyclical",
    "OBEROIRLTY": "Consumer Cyclical",
    "PRESTIGE": "Consumer Cyclical",
    "INDUSTOWER": "Telecom",
    "SUNTV": "Communication Services",
    "PVRINOX": "Communication Services",
    "NAUKRI": "Communication Services",
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
