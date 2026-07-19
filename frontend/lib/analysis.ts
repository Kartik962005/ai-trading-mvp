// Pure analysis / chart helpers extracted verbatim from app/page.tsx during the
// Phase A foundation refactor (see REDESIGN_3D_MASTERPLAN.md). No React, no side
// effects — safe to import anywhere.

export const STRATEGY_NAMES: Record<number, string> = {
  1: 'Moving Average Crossover',
  2: 'EMA Pullback',
  3: 'Supertrend',
  4: 'Breakout Trading',
  5: 'Trendline Breakout + Retest',
  6: 'Volume Anomaly',
  7: 'Relative Strength',
  8: 'Momentum Ignition',
  9: 'VWAP Trend',
  10: 'Gap-Up Momentum',
  11: 'RSI Divergence',
  12: 'MACD Divergence',
  13: 'Mean Reversion',
  14: 'Bollinger Band Reversal',
  15: 'Volatility Expansion',
  16: 'ATR Breakout',
  17: 'Liquidity Sweep',
  18: 'Order Block',
  19: 'Support/Resistance Flip',
  20: 'Multi-Factor AI Strategy',
};

export function normalizeStrategyEvals(strategyEvals: any) {
  const entries: Array<[string, any]> = Array.isArray(strategyEvals)
    ? strategyEvals.map((value, index) => [String(value?.id ?? index + 1), value])
    : Object.entries(strategyEvals ?? {});

  return entries
    .map(([id, value]) => {
      const numericId = Number(id);
      return {
        id: numericId || id,
        name: value?.name ?? STRATEGY_NAMES[numericId] ?? `Strategy ${id}`,
        score: Number(value?.score ?? 0),
        desc: value?.desc ?? 'Signal details unavailable.',
      };
    })
    .filter(strategy => Number.isFinite(strategy.score))
    .sort((a, b) => b.score - a.score);
}

export function toFiniteNumber(value: any, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function getAnalysisPresentation(analysis: any) {
  if (!analysis || analysis.error) return null;

  const entry = toFiniteNumber(analysis.entry, toFiniteNumber(analysis.current_price, 0));
  const target = toFiniteNumber(analysis.target, entry);
  const stopLoss = toFiniteNumber(analysis.stop_loss, entry);
  const originalVerdict = String(analysis.verdict ?? '').trim();
  const isNoTrade = analysis.signal_status === 'no_trade' || /^hold$/i.test(originalVerdict);

  const bullishSetup = target > entry && stopLoss < entry;
  const bearishSetup = target < entry && stopLoss > entry;

  let displayVerdict = originalVerdict || 'Hold';

  if (isNoTrade) {
    displayVerdict = 'Hold';
  } else if (bearishSetup) {
    displayVerdict = originalVerdict.includes('Strong') ? 'Strong Sell' : 'Sell';
  } else if (bullishSetup) {
    displayVerdict = /sell/i.test(originalVerdict)
      ? originalVerdict.includes('Strong') ? 'Strong Buy' : 'Buy'
      : originalVerdict || 'Buy';
  }

  const direction = isNoTrade ? 'neutral' : bearishSetup ? 'bearish' : bullishSetup ? 'bullish' : 'neutral';
  const isBullish = !isNoTrade && (direction === 'bullish' || /buy/i.test(displayVerdict));
  const isBearish = !isNoTrade && (direction === 'bearish' || /sell/i.test(displayVerdict));

  return {
    ...analysis,
    entry,
    target,
    stop_loss: stopLoss,
    displayVerdict,
    direction,
    isBullish,
    isBearish,
    isHold: isNoTrade || (!isBullish && !isBearish),
    confidenceLevel: toFiniteNumber(analysis.fiso_score, 0),
  };
}

export function getChartCandles(chartData: any) {
  if (!Array.isArray(chartData)) return [];
  return chartData
    .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
    .map((d: any) => ({ ...d, day: d.date.toString().slice(0, 10) }))
    .sort((a: any, b: any) => a.day.localeCompare(b.day));
}
