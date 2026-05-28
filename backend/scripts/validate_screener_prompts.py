from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.screener_service import _parse_rules  # noqa: E402


PROMPTS = [
    "Small cap stocks with maximum gain in the last 1 week",
    "Small cap stocks that gained more than 10% in the last 7 days",
    "Midcap stocks with highest return in the last 1 month",
    "Large cap stocks up more than 3% today",
    "Penny stocks with more than 20% gain in the last week",
    "Stocks that doubled in the last 6 months",
    "Stocks with positive returns in the last 1 week, 1 month, and 3 months",
    "Stocks with highest 3-month price performance",
    "Stocks trading near their 52-week high with strong weekly gain",
    "Stocks trading near their 52-week low but up today",
    "Stocks that have gained for the last 4 consecutive trading days",
    "Stocks that have fallen for the last 5 consecutive trading days",
    "Stocks rising continuously for the last 3 days with high volume",
    "Stocks whose average volume is higher than last week average volume",
    "Stocks with today volume more than 2 times the 10-day average volume",
    "Oversold stocks with RSI below 30",
    "Stocks with RSI above 70 showing overbought condition",
    "Stocks with RSI crossing above 50 today",
    "Stocks trading above 20-day moving average",
    "Stocks trading above 50-day moving average",
    "Stocks trading above 200-day moving average",
    "Golden crossover stocks today",
    "Death crossover stocks today",
    "Stocks breaking out above previous day high",
    "Stocks near important support level",
    "Stocks that hit upper circuit today",
    "Stocks that opened gap up today",
    "Stocks forming bullish engulfing candle today",
    "Stocks with ATR increasing in the last 5 days",
    "Companies with sales growth above 20% YoY",
    "Undervalued stocks with PE ratio below industry average",
    "Companies with ROE above 20%",
    "Debt-free companies with consistent profit growth",
    "Stocks where promoter holding is above 50%",
    "Stocks with results announced today",
    "Best performing banking stocks this week",
    "IT stocks with strong momentum today",
    "Pharma stocks trading near 52-week high",
    "F&O stocks with highest open interest addition today",
    "Stocks outperforming Nifty 50 this week",
    "Stocks that are stronger than Nifty in falling market",
    "Small cap stocks up more than 5% today with volume above 2x average",
    "Stocks with price breakout, volume breakout, and RSI above 60",
    "Stockks that have gained in last 4 consecutive days",
    "Stocoks that have hit upper circuit today",
    "Stocks whose average volumne is more than last week volume average",
    "Which shares can give momentum tomorrow based on today volume",
]


def main() -> int:
    failures = []
    parsed = []
    for prompt in PROMPTS:
        rules = _parse_rules(prompt)
        row = {
            "prompt": prompt,
            "recognized": rules["recognized"],
            "direction": rules.get("direction"),
            "lookback_days": rules.get("lookback_days"),
            "rank_by": rules.get("rank_by"),
            "cap_bucket": rules.get("cap_bucket"),
            "relative_strength": rules.get("relative_strength"),
            "falling_market": rules.get("falling_market"),
            "unavailable_data": rules.get("unavailable_data"),
        }
        parsed.append(row)
        if not rules["recognized"]:
            failures.append(prompt)

    print(json.dumps({"checked": len(PROMPTS), "failures": failures, "sample": parsed}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
