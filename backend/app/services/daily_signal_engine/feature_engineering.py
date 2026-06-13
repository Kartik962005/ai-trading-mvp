from __future__ import annotations

import pandas as pd
import ta


# EMA50 + ADX(14) + 20-day rolling windows need a real history. On an empty or
# too-short frame the underlying `ta` library raises ("negative dimensions")
# instead of returning NaN, so guard and return empty — callers treat an empty
# feature frame as "no usable data" and skip the ticker.
_MIN_BARS_FOR_FEATURES = 60


def build_feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty or len(frame) < _MIN_BARS_FOR_FEATURES:
        return pd.DataFrame()
    if not {"close", "high", "low", "volume"}.issubset(frame.columns):
        return pd.DataFrame()
    work = frame.copy()
    close = work["close"]
    high = work["high"]
    low = work["low"]
    volume = work["volume"]

    work["ema20"] = ta.trend.ema_indicator(close, window=20)
    work["ema50"] = ta.trend.ema_indicator(close, window=50)
    work["rsi14"] = ta.momentum.rsi(close, window=14)
    work["adx14"] = ta.trend.adx(high, low, close, window=14)
    work["atr14"] = ta.volatility.average_true_range(high, low, close, window=14)
    work["vol_avg20"] = volume.rolling(20).mean()
    work["resistance20"] = high.rolling(20).max().shift(1)
    work["support20"] = low.rolling(20).min().shift(1)
    work["ret20"] = close.pct_change(20)
    work["ret5"] = close.pct_change(5)
    work["range_pct"] = (high - low) / close
    work["close_above_ema20"] = (close > work["ema20"]).astype(float)
    work["ema20_above_ema50"] = (work["ema20"] > work["ema50"]).astype(float)
    return work.dropna().reset_index(drop=True)
