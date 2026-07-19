// Pure chart / indicator-series builders extracted verbatim from app/page.tsx
// during the Phase A foundation refactor. No React — the JSX chart components
// stay in page.tsx and import these.

import { getChartCandles } from './analysis';
import {
  asNumber,
  mean,
  rollingMean,
  rollingMin,
  rollingMax,
  rollingStd,
  ema,
  rsi,
  formatIndicatorValue,
  getIndicatorColor,
} from './indicators';

export type IndicatorPoint = {
  label: string;
  value: number;
};

export type IndicatorPanelData = {
  name: string;
  color: string;
  latest: string;
  series: IndicatorPoint[];
};

export function buildIndicatorPanel(name: string, chartData: any): IndicatorPanelData | null {
  const candles = getChartCandles(chartData);
  if (candles.length < 2) return null;

  const close = candles.map((c: any) => asNumber(c.close));
  const open = candles.map((c: any) => asNumber(c.open));
  const high = candles.map((c: any) => asNumber(c.high));
  const low = candles.map((c: any) => asNumber(c.low));
  const volume = candles.map((c: any) => asNumber(c.volume));
  const typical = close.map((value, index) => (high[index] + low[index] + value) / 3);
  const lowerName = name.toLowerCase();
  const range = high.map((value, index) => Math.max(value - low[index], 0.0001));
  const trueRange = close.map((value, index) => {
    if (index === 0) return range[index];
    return Math.max(high[index] - low[index], Math.abs(high[index] - close[index - 1]), Math.abs(low[index] - close[index - 1]));
  });
  const atr = rollingMean(trueRange, 14);
  const ma20 = rollingMean(close, 20);
  const ma50 = rollingMean(close, 50);
  const ema12 = ema(close, 12);
  const ema26 = ema(close, 26);
  const std20 = rollingStd(close, 20);
  const high20 = rollingMax(high, 20);
  const low20 = rollingMin(low, 20);
  let values: number[];

  if (lowerName.includes('macd')) {
    values = close.map((_, index) => ema12[index] - ema26[index]);
  } else if (lowerName.includes('relative strength index') || lowerName.includes('connors rsi') || lowerName.includes('stochastic rsi')) {
    values = rsi(close, lowerName.includes('connors') ? 3 : 14);
  } else if (lowerName.includes('stochastic')) {
    values = close.map((value, index) => ((value - low20[index]) / Math.max(high20[index] - low20[index], 0.0001)) * 100);
  } else if (lowerName.includes('williams')) {
    values = close.map((value, index) => ((high20[index] - value) / Math.max(high20[index] - low20[index], 0.0001)) * -100);
  } else if (lowerName.includes('money flow') || lowerName.includes('chaikin money')) {
    values = close.map((_, index) => {
      const start = Math.max(0, index - 19);
      let mfv = 0;
      let vol = 0;
      for (let i = start; i <= index; i += 1) {
        const multiplier = ((close[i] - low[i]) - (high[i] - close[i])) / Math.max(high[i] - low[i], 0.0001);
        mfv += multiplier * volume[i];
        vol += volume[i];
      }
      return vol ? (mfv / vol) * 100 : 0;
    });
  } else if (lowerName.includes('accumulation') || lowerName.includes('on balance') || lowerName.includes('price volume') || lowerName.includes('net volume')) {
    let cumulative = 0;
    values = close.map((value, index) => {
      if (index === 0) return 0;
      const direction = value > close[index - 1] ? 1 : value < close[index - 1] ? -1 : 0;
      cumulative += direction * volume[index];
      return cumulative;
    });
  } else if (lowerName.includes('average true range') || lowerName.includes('atr')) {
    values = atr;
  } else if (lowerName.includes('bollinger') || lowerName.includes('standard error bands')) {
    values = close.map((value, index) => ((value - (ma20[index] - 2 * std20[index])) / Math.max(4 * std20[index], 0.0001)) * 100);
  } else if (lowerName.includes('donchian') || lowerName.includes('price channel') || lowerName.includes('52 week')) {
    values = close.map((value, index) => ((value - low20[index]) / Math.max(high20[index] - low20[index], 0.0001)) * 100);
  } else if (lowerName.includes('aroon')) {
    values = close.map((_, index) => {
      const start = Math.max(0, index - 24);
      const highs = high.slice(start, index + 1);
      const lows = low.slice(start, index + 1);
      const highAge = highs.length - 1 - highs.lastIndexOf(Math.max(...highs));
      const lowAge = lows.length - 1 - lows.lastIndexOf(Math.min(...lows));
      return ((25 - highAge) / 25) * 100 - ((25 - lowAge) / 25) * 100;
    });
  } else if (lowerName.includes('commodity channel') || lowerName.includes('cci')) {
    const avgTypical = rollingMean(typical, 20);
    values = typical.map((value, index) => {
      const start = Math.max(0, index - 19);
      const deviation = mean(typical.slice(start, index + 1).map(item => Math.abs(item - avgTypical[index])));
      return (value - avgTypical[index]) / Math.max(0.015 * deviation, 0.0001);
    });
  } else if (lowerName.includes('vwap') || lowerName.includes('vwma') || lowerName.includes('volume weighted')) {
    let pv = 0;
    let vol = 0;
    values = close.map((value, index) => {
      pv += typical[index] * volume[index];
      vol += volume[index];
      return vol ? pv / vol : value;
    });
  } else if (lowerName.includes('volume')) {
    values = volume;
  } else if (lowerName.includes('volatility') || lowerName.includes('standard deviation') || lowerName.includes('standard error')) {
    values = close.map((value, index) => (rollingStd(close.slice(0, index + 1), 20).at(-1) || 0) / Math.max(value, 0.0001) * 100);
  } else if (lowerName.includes('momentum') || lowerName.includes('rate of change') || lowerName.includes('roc')) {
    values = close.map((value, index) => index < 10 ? 0 : ((value - close[index - 10]) / Math.max(close[index - 10], 0.0001)) * 100);
  } else if (lowerName.includes('moving average') || lowerName.includes('ema') || lowerName.includes('ma cross') || lowerName.includes('alligator') || lowerName.includes('mcginley')) {
    values = lowerName.includes('exponential') || lowerName.includes('ema') ? ema(close, 20) : ma20;
  } else if (lowerName.includes('supertrend') || lowerName.includes('parabolic') || lowerName.includes('keltner') || lowerName.includes('chande kroll')) {
    values = close.map((value, index) => value >= ma20[index] ? value - 2 * atr[index] : value + 2 * atr[index]);
  } else if (lowerName.includes('median')) {
    values = high.map((value, index) => (value + low[index]) / 2);
  } else if (lowerName.includes('typical') || lowerName.includes('average price')) {
    values = typical;
  } else if (lowerName.includes('balance of power')) {
    values = close.map((value, index) => ((value - open[index]) / range[index]) * 100);
  } else if (lowerName.includes('directional') || lowerName.includes('trend strength')) {
    values = close.map((value, index) => ((ma20[index] - ma50[index]) / Math.max(value, 0.0001)) * 100);
  } else {
    values = close.map((value, index) => index === 0 ? 0 : ((value - close[index - 1]) / Math.max(close[index - 1], 0.0001)) * 100);
  }

  const cleanValues = values.map(value => Number.isFinite(value) ? value : 0);
  const series = cleanValues.map((value, index) => ({ label: candles[index].day, value })).slice(-120);
  const latest = series.at(-1)?.value ?? 0;
  return {
    name,
    color: getIndicatorColor(name),
    latest: formatIndicatorValue(latest, name),
    series,
  };
}

export function buildSvgPath(series: IndicatorPoint[], width = 720, height = 150) {
  if (series.length < 2) return '';
  const values = series.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  return series
    .map((point, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * width;
      const y = height - ((point.value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function buildPreviewChartPath(chartData: any, width = 720, height = 190) {
  const candles = getChartCandles(chartData).slice(-90);
  if (candles.length < 2) return '';
  const values = candles.map((c: any) => asNumber(c.close));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}
