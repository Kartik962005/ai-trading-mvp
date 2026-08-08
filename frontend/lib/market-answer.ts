// Rule-based market Q&A responder, extracted verbatim from app/page.tsx during
// the Phase A foundation refactor. Pure — returns a plain answer object or null.

import { getChartCandles, getAnalysisPresentation } from './analysis';

export function buildMarketAnswer(prompt: string, analysis: any, ticker: string, currency: string, chartData: any) {
  const clean = prompt.toLowerCase();
  const candles = getChartCandles(chartData);
  const latest = candles[candles.length - 1];
  const recent = candles.slice(-20);
  const previous = candles[candles.length - 2];
  const wantsNowPrice = /\b(current|now|today|latest|live).*\b(price|close|value)\b|\b(price|close|value).*\b(current|now|today|latest|live)\b/i.test(prompt);
  const wantsPrediction = /\b(should i buy|buy or sell|prediction|target|stop loss|forecast|verdict|recommend)\b/i.test(prompt);
  const wantsTrend = /\b(trend|momentum|bullish|bearish|uptrend|downtrend|moving average|ma|strong|weak)\b/i.test(prompt);
  const wantsRisk = /\b(risk|risky|stop|stoploss|stop loss|downside|upside|reward|target)\b/i.test(prompt);
  const wantsLevels = /\b(support|resistance|range|breakout|break down|breakdown|level)\b/i.test(prompt);
  const analysisView = getAnalysisPresentation(analysis);

  if (wantsNowPrice && latest) {
    return {
      type: 'assistant_answer',
      title: 'Latest loaded price',
      answer: `${ticker} last loaded close is ${currency}${Number(latest.close).toLocaleString(undefined, { maximumFractionDigits: 2 })} from ${latest.day}.`,
      rows: [
        ['Open', latest.open],
        ['High', latest.high],
        ['Low', latest.low],
        ['Close', latest.close],
      ],
    };
  }

  if (wantsPrediction && analysisView) {
    return {
      type: 'assistant_answer',
      title: 'Bullseye read',
      answer: `${ticker} is currently marked ${analysisView.displayVerdict}. Entry is ${currency}${analysisView.entry}, target is ${currency}${analysisView.target}, stop loss is ${currency}${analysisView.stop_loss}, and the FISO confidence level is ${analysisView.confidenceLevel}/100.`,
      rows: [
        ['FISO confidence level', analysisView.confidenceLevel],
        ['Estimated days', analysisView.estimated_days],
        ['Target date', analysisView.target_date],
      ],
    };
  }

  if ((wantsTrend || wantsLevels) && latest && recent.length >= 5) {
    const closes = recent.map((candle: any) => Number(candle.close)).filter(Number.isFinite);
    const highs = recent.map((candle: any) => Number(candle.high)).filter(Number.isFinite);
    const lows = recent.map((candle: any) => Number(candle.low)).filter(Number.isFinite);
    const high20 = Math.max(...highs);
    const low20 = Math.min(...lows);
    const startClose = closes[0];
    const endClose = closes[closes.length - 1];
    const changePct = startClose ? ((endClose - startClose) / startClose) * 100 : 0;
    const direction = changePct > 2 ? 'positive' : changePct < -2 ? 'weak' : 'sideways';

    return {
      type: 'assistant_answer',
      title: wantsLevels ? 'Support and resistance' : 'Trend read',
      answer: `${ticker} looks ${direction} over the last ${recent.length} loaded candles. The recent range is ${currency}${low20.toLocaleString(undefined, { maximumFractionDigits: 2 })} to ${currency}${high20.toLocaleString(undefined, { maximumFractionDigits: 2 })}, with a ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% close-to-close move.`,
      rows: [
        ['Latest close', latest.close],
        ['20-candle support', low20],
        ['20-candle resistance', high20],
        ['20-candle move', `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`],
      ],
    };
  }

  if (wantsRisk && analysisView && latest) {
    const entry = Number(analysisView.entry || latest.close);
    const target = Number(analysisView.target);
    const stop = Number(analysisView.stop_loss);
    const upside = entry ? ((target - entry) / entry) * 100 : 0;
    const downside = entry ? ((entry - stop) / entry) * 100 : 0;

    return {
      type: 'assistant_answer',
      title: 'Risk and reward',
      answer: `${ticker} setup has about ${upside.toFixed(2)}% target room versus ${downside.toFixed(2)}% stop-loss risk from the model entry. Treat this as research, not financial advice.`,
      rows: [
        ['Entry', entry],
        ['Target', target],
        ['Stop loss', stop],
        ['Reward/risk', downside > 0 ? (upside / downside).toFixed(2) : '-'],
      ],
    };
  }

  if (/\b(yesterday|previous|last session|last candle)\b/i.test(clean) && previous) {
    const move = Number(previous.close) ? ((Number(latest.close) - Number(previous.close)) / Number(previous.close)) * 100 : 0;
    return {
      type: 'assistant_answer',
      title: 'Previous session comparison',
      answer: `${ticker} moved ${move >= 0 ? '+' : ''}${move.toFixed(2)}% from ${previous.day} close to ${latest.day} close.`,
      rows: [
        ['Previous close', previous.close],
        ['Latest close', latest.close],
        ['Change', `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`],
        ['Latest date', latest.day],
      ],
    };
  }

  if (/\b(help|what can you do|examples?)\b/i.test(clean)) {
    return {
      type: 'assistant_answer',
      title: 'AI search is ready',
      answer: 'Ask for a dated price, current loaded price, holding profit/loss, buy/sell read, or a custom backtest strategy.',
      rows: [
        ['Example', 'If I buy Friday closing price and sell Monday opening price, test it'],
        ['Example', 'Bought 1000 shares 60 days ago profit or loss'],
        ['Example', 'Opening price on 12 Feb 2025'],
        ['Example', 'Backtest RSI crosses above 30 and sell above 70'],
      ],
    };
  }

  return null;
}
