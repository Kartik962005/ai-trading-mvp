// Pure analysis / chart helpers extracted verbatim from app/page.tsx during the
// Phase A foundation refactor (see REDESIGN_3D_MASTERPLAN.md). No React, no side
// effects — safe to import anywhere.

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
