'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { STOCKS } from './stocks';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL
  || (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000'
    : 'https://ai-trading-backend-jhcl.onrender.com');
const fetcher = (url: string) => fetch(`${BACKEND}${url}`).then(res => res.json());
const CACHE_TTL = 1000 * 60 * 60 * 6;
type MarketScope = 'INDIA' | 'US';
type DashboardView = 'overview' | 'details';
type ChartRange = '1d' | '1w' | '1mo' | '1y';

const STRATEGY_NAMES: Record<number, string> = {
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

function normalizeStrategyEvals(strategyEvals: any) {
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

function toFiniteNumber(value: any, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getAnalysisPresentation(analysis: any) {
  if (!analysis || analysis.error) return null;

  const entry = toFiniteNumber(analysis.entry, toFiniteNumber(analysis.current_price, 0));
  const target = toFiniteNumber(analysis.target, entry);
  const stopLoss = toFiniteNumber(analysis.stop_loss, entry);
  const originalVerdict = String(analysis.verdict ?? '').trim();

  const bullishSetup = target > entry && stopLoss < entry;
  const bearishSetup = target < entry && stopLoss > entry;

  let displayVerdict = originalVerdict || 'Hold';

  if (bearishSetup) {
    displayVerdict = originalVerdict.includes('Strong') ? 'Strong Sell' : 'Sell';
  } else if (bullishSetup) {
    displayVerdict = /sell/i.test(originalVerdict)
      ? originalVerdict.includes('Strong') ? 'Strong Buy' : 'Buy'
      : originalVerdict || 'Buy';
  }

  const direction = bearishSetup ? 'bearish' : bullishSetup ? 'bullish' : 'neutral';
  const isBullish = direction === 'bullish' || /buy/i.test(displayVerdict);
  const isBearish = direction === 'bearish' || /sell/i.test(displayVerdict);

  return {
    ...analysis,
    entry,
    target,
    stop_loss: stopLoss,
    displayVerdict,
    direction,
    isBullish,
    isBearish,
    isHold: !isBullish && !isBearish,
    confidenceLevel: toFiniteNumber(analysis.fiso_score, 0),
  };
}

const MONTH_INDEX: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};
const MONTH_WORDS = Object.keys(MONTH_INDEX);

function parseRequestedDate(prompt: string) {
  const clean = prompt.toLowerCase();
  const namedDate = clean.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/);
  if (namedDate) {
    const year = namedDate[3] ?? String(new Date().getFullYear());
    const monthToken = namedDate[2];
    const month = MONTH_INDEX[monthToken] ?? MONTH_INDEX[MONTH_WORDS.find(word => getLevenshteinDistance(monthToken, word) <= 1) ?? ''];
    if (!month) return null;
    const day = namedDate[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const numericDate = clean.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/) ?? clean.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  if (!numericDate) return null;

  if (numericDate[0].includes('-') && numericDate[1].length === 4) {
    return `${numericDate[1]}-${numericDate[2].padStart(2, '0')}-${numericDate[3].padStart(2, '0')}`;
  }

  const year = numericDate[3] ?? String(new Date().getFullYear());
  const day = numericDate[1].padStart(2, '0');
  const month = numericDate[2].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasPriceLookupIntent(prompt: string) {
  return /\b(price|open|opening|close|closing|ohlc|candle|high|low)\b/i.test(prompt);
}

function getCache<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

function setCache(key: string, data: any) {
  if (typeof window === 'undefined' || !data || data.error) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function getNearestCandles(chartData: any, requestedDate: string | null) {
  if (!requestedDate || !Array.isArray(chartData)) return { previous: null, next: null };
  const candles = chartData
    .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
    .map((d: any) => ({ ...d, day: d.date.toString().slice(0, 10) }))
    .sort((a: any, b: any) => a.day.localeCompare(b.day));

  return {
    previous: [...candles].reverse().find((d: any) => d.day < requestedDate) ?? null,
    next: candles.find((d: any) => d.day > requestedDate) ?? null,
  };
}

function getChartCandles(chartData: any) {
  if (!Array.isArray(chartData)) return [];
  return chartData
    .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
    .map((d: any) => ({ ...d, day: d.date.toString().slice(0, 10) }))
    .sort((a: any, b: any) => a.day.localeCompare(b.day));
}

function parseShareQuantity(prompt: string) {
  const clean = prompt.toLowerCase();
  const match =
    clean.match(/\b(?:bought|buy|purchased|purchase|held|holding)\s+(\d+(?:,\d{3})*|\d+(?:\.\d+)?)\s*(?:shares|stocks|qty|quantity)?\b/) ??
    clean.match(/\b(\d+(?:,\d{3})*|\d+(?:\.\d+)?)\s*(?:shares|stocks|qty|quantity)\b/);
  if (!match) return null;
  const value = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDaysAgo(prompt: string) {
  const match = prompt.toLowerCase().match(/\b(\d+)\s*(?:trading\s*)?(?:days?|sessions?)\s*ago\b/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveHoldingPnl(prompt: string, chartData: any) {
  const quantity = parseShareQuantity(prompt);
  const daysAgo = parseDaysAgo(prompt);
  const candles = getChartCandles(chartData);
  const wantsPnl = /\b(profit|loss|pnl|p&l|return|earned|made|gain|gained)\b/i.test(prompt);
  const hasHoldingIntent = /\b(bought|buy|purchased|purchase|invested|held|holding|shares|stocks)\b/i.test(prompt);

  if (!quantity || !daysAgo || !wantsPnl || !hasHoldingIntent || candles.length < 2) return null;

  const buyIndex = Math.max(0, candles.length - 1 - daysAgo);
  const buyCandle = candles[buyIndex];
  const latest = candles[candles.length - 1];
  const buyPrice = Number(buyCandle.close);
  const currentPrice = Number(latest.close);
  const pnl = (currentPrice - buyPrice) * quantity;
  const invested = buyPrice * quantity;
  const currentValue = currentPrice * quantity;
  const returnPct = invested ? (pnl / invested) * 100 : 0;

  return {
    type: 'holding_pnl',
    quantity,
    requestedDays: daysAgo,
    actualDays: candles.length - 1 - buyIndex,
    buyDate: buyCandle.day,
    latestDate: latest.day,
    buyPrice,
    currentPrice,
    invested,
    currentValue,
    pnl,
    returnPct,
  };
}

function buildMarketAnswer(prompt: string, analysis: any, ticker: string, currency: string, chartData: any) {
  const clean = prompt.toLowerCase();
  const candles = getChartCandles(chartData);
  const latest = candles[candles.length - 1];
  const wantsNowPrice = /\b(current|now|today|latest|live).*\b(price|close|value)\b|\b(price|close|value).*\b(current|now|today|latest|live)\b/i.test(prompt);
  const wantsPrediction = /\b(should i buy|buy or sell|prediction|target|stop loss|forecast|verdict|recommend)\b/i.test(prompt);
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
        ['Best strategy', STRATEGY_NAMES[analysisView.best_strategy_id] ?? `Strategy ${analysisView.best_strategy_id}`],
      ],
    };
  }

  if (/\b(help|what can you do|examples?)\b/i.test(clean)) {
    return {
      type: 'assistant_answer',
      title: 'AI search is ready',
      answer: 'Ask for a dated price, current loaded price, holding profit/loss, buy/sell read, or a custom backtest strategy.',
      rows: [
        ['Example', 'Bought 1000 shares 60 days ago profit or loss'],
        ['Example', 'Opening price on 12 Feb 2025'],
        ['Example', 'Backtest RSI crosses above 30 and sell above 70'],
      ],
    };
  }

  return null;
}

function getLevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr: number[][] = [];
  for (let i = 0; i <= t.length; i++) { arr[i] = [i]; for (let j = 1; j <= s.length; j++) { arr[i][j] = i === 0 ? j : Math.min(arr[i - 1][j] + 1, arr[i][j - 1] + 1, arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)); } }
  return arr[t.length][s.length];
}

function resolveMarket(exchange: string): MarketScope {
  return exchange === 'NASDAQ' || exchange === 'NYSE' ? 'US' : 'INDIA';
}

function isIndianStock(stock?: typeof STOCKS[number] | null) {
  return !!stock && resolveMarket(stock.exchange) === 'INDIA';
}

function formatIndianNumber(value: any, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: numeric % 1 === 0 ? 0 : Math.min(digits, 2),
  }).format(numeric);
}

function formatCurrencyNumber(value: any, currencySymbol: string, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${currencySymbol}${formatIndianNumber(numeric, digits)}`;
}

function formatCompactRupees(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const absolute = Math.abs(numeric);
  if (absolute >= 10000000) return `${(numeric / 10000000).toFixed(2)} Cr`;
  if (absolute >= 100000) return `${(numeric / 100000).toFixed(2)} L`;
  return formatIndianNumber(numeric, 2);
}

function formatMarketCap(value: any, unit?: string, currencySymbol = '₹') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  if (unit === 'crore') return `${currencySymbol}${formatIndianNumber(numeric, 2)} Cr`;
  return `${currencySymbol}${formatCompactRupees(numeric)}`;
}

function formatRatioValue(value: any, kind?: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  if (kind === 'percent') return `${numeric.toFixed(2)}%`;
  return formatIndianNumber(numeric, 2);
}

function humanizeLabel(label: string) {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── TICKER TAPE ─────────────────────────────────────────────────────────────
const TickerItem = ({ title, symbol, currency }: { title: string; symbol: string; currency: string }) => {
  const { data } = useSWR(`/api/v1/quote/${symbol}`, fetcher, { refreshInterval: 15000 });
  return (
    <div className="flex items-center gap-4 shrink-0 px-8 border-r border-white/10">
      <span className="font-bold text-xs tracking-widest text-zinc-400 uppercase font-['Space_Grotesk']">{title}</span>
      {data?.price ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-['JetBrains_Mono'] text-white">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.change_percent > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>            {data.change_percent > 0 ? '▲' : '▼'}{Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </div>
      ) : <span className="text-xs text-zinc-600 font-['JetBrains_Mono'] tracking-widest">SYNCING...</span>}
    </div>
  );
};

// ─── MARKET ASSET CARD ────────────────────────────────────────────────────────
const MarketAssetCard = ({
  stock,
  onSelect,
  prefetchedAnalysis,
  expanded,
  onToggle,
}: {
  stock: typeof STOCKS[0];
  onSelect: (s: typeof STOCKS[0]) => void;
  prefetchedAnalysis?: any;
  expanded: boolean;
  onToggle: (ticker: string) => void;
}) => {
  // Only hit the API if we have no prefetched data yet
  const { data: fetchedAnalysis } = useSWR(
    expanded && !prefetchedAnalysis ? `/api/v1/analyze/${stock.ticker}` : null,
    fetcher
  );

  // Prefer prefetched; fall back to on-demand fetch
  const analysis = prefetchedAnalysis ?? fetchedAnalysis;
  const analysisView = getAnalysisPresentation(analysis);
  const isReady = !!analysisView;
  const isPrefetching = !analysisView; // still loading in background

  const isBull = analysisView?.isBullish;
  const isHold = analysisView?.isHold;
  const verdictColor = isBull ? 'text-green-400' : isHold ? 'text-zinc-300' : 'text-red-400';
  const verdictBadge = isReady ? analysisView.displayVerdict.replace('Strong ', '') : 'Loading';

  // Mini verdict dot shown even before hover when prefetch is done
  const dotColor = isReady
    ? (isBull ? 'bg-green-400' : isHold ? 'bg-zinc-400' : 'bg-red-400')
    : 'bg-zinc-700 animate-pulse';
  const signalGradient = isReady
    ? (isBull ? 'from-emerald-400 to-cyan-400' : isHold ? 'from-slate-400 to-cyan-300' : 'from-rose-400 to-orange-300')
    : 'from-slate-300 to-slate-100';

  return (
    <div
      className={`relative min-h-[164px] p-4 sm:p-5 border bg-white/85 backdrop-blur-md rounded-[22px] transition-all duration-300 group flex flex-col justify-start overflow-hidden select-none shadow-[0_18px_55px_rgba(15,23,42,0.08)] hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(8,145,178,0.16)]
        ${expanded ? 'border-cyan-300 ring-2 ring-cyan-200/70 bg-white' : 'border-slate-200/80 hover:border-cyan-200'}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${signalGradient}`} />
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-100/55 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex justify-between items-start gap-2 mb-5">
        <div className="min-w-0">
          <span className={`block truncate text-[11px] font-black font-['JetBrains_Mono'] transition-colors ${expanded ? 'text-cyan-600' : 'text-slate-500 group-hover:text-cyan-600'}`}>{stock.symbol}</span>
          <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500 font-['JetBrains_Mono']">{stock.exchange}</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Live verdict dot — green/red/grey based on prefetch status */}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} title={isReady ? analysisView.displayVerdict : 'Loading...'} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(stock.ticker); }}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-cyan-600 hover:bg-cyan-50 hover:border-cyan-300 transition-all flex items-center justify-center shrink-0 shadow-sm"
            aria-label={`${expanded ? 'Hide' : 'Show'} ${stock.symbol} preview`}
            title={`${expanded ? 'Hide' : 'Show'} preview`}
          >
            <span className={`text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
          </button>
        </div>
      </div>
      <div className="relative font-black text-base text-slate-950 font-['Space_Grotesk'] leading-snug line-clamp-2 min-h-11">{stock.name}</div>

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isReady ? '' : 'animate-pulse'}`}
            style={{
              width: `${isReady ? analysisView.confidenceLevel : 28}%`,
              backgroundColor: isReady ? (isBull ? '#4ade80' : isHold ? '#71717a' : '#f87171') : '#94a3b8',
            }}
          />
        </div>
        <span className={`shrink-0 text-[9px] sm:text-[10px] font-black uppercase tracking-widest font-['Space_Grotesk'] ${
          isReady ? verdictColor : 'text-slate-400'
        }`}>
          {verdictBadge}
        </span>
      </div>

      <div className={`relative transition-all duration-300 ease-in-out ${expanded ? 'max-h-56 opacity-100 mt-4 border-t border-slate-200 pt-4' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        {isReady ? (
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Verdict</span>
              <span className={`text-sm font-black uppercase tracking-widest ${verdictColor}`}>{analysisView.displayVerdict}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">FISO Confidence</span>
              <span className="text-sm font-['JetBrains_Mono'] text-slate-950 font-bold">{analysisView.confidenceLevel}/100</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Target</span>
              <span className="text-sm font-['JetBrains_Mono'] text-green-400 font-bold">{stock.currency}{analysisView.target}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Stop Loss</span>
              <span className="text-sm font-['JetBrains_Mono'] text-red-400 font-bold">{stock.currency}{analysisView.stop_loss}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(stock); }}
              className="w-full mt-1 py-2 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-700 text-[10px] font-black uppercase tracking-widest font-['JetBrains_Mono'] hover:bg-cyan-100 transition-all"
            >
              Full Analysis →
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-3 h-3 border border-zinc-700 border-t-cyan-400 rounded-full animate-spin shrink-0" />
            <span className="text-[10px] text-cyan-500/70 animate-pulse font-['JetBrains_Mono'] tracking-widest">
              {isPrefetching ? 'LOADING...' : 'INITIALIZING...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── DETAILED FISO PANEL ──────────────────────────────────────────────────────
const FisoDetailPanel = ({ analysis, currency, ticker, chartData }: { analysis: any; currency: string; ticker: string; chartData: any }) => {
  const analysisView = getAnalysisPresentation(analysis);
  if (!analysisView) return null;

  const isBull = analysisView.isBullish;
  const isHold = analysisView.isHold;
  const accentColor = isBull ? 'text-green-400' : isHold ? 'text-zinc-300' : 'text-red-400';
  const accentBg = isBull ? 'bg-green-500/10 border-green-500/30' : isHold ? 'bg-zinc-500/10 border-zinc-500/30' : 'bg-red-500/10 border-red-500/30';
  const accentGlow = isBull ? 'shadow-[0_0_30px_rgba(74,222,128,0.15)]' : isHold ? '' : 'shadow-[0_0_30px_rgba(239,68,68,0.15)]';
  const targetMovePctValue = analysisView.entry
    ? (analysisView.direction === 'bearish'
      ? ((analysisView.entry - analysisView.target) / analysisView.entry) * 100
      : ((analysisView.target - analysisView.entry) / analysisView.entry) * 100)
    : 0;
  const stopRiskPctValue = analysisView.entry
    ? (analysisView.direction === 'bearish'
      ? ((analysisView.stop_loss - analysisView.entry) / analysisView.entry) * 100
      : ((analysisView.entry - analysisView.stop_loss) / analysisView.entry) * 100)
    : 0;
  const targetMovePct = targetMovePctValue.toFixed(2);
  const stopRiskPct = stopRiskPctValue.toFixed(2);
  const rr = (stopRiskPctValue > 0 ? targetMovePctValue / stopRiskPctValue : 0).toFixed(2);
  const setupLabel = analysisView.direction === 'bearish'
    ? 'Sell-side target'
    : analysisView.direction === 'bullish'
      ? 'Buy-side target'
      : 'Balanced setup';

  // AI search state (lifted into FisoDetailPanel so it lives next to the section)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [isAiRunning, setIsAiRunning] = useState(false);

  const handleAiSearch = async () => {
    if (!aiPrompt || !ticker) return;
    setIsAiRunning(true);
    setAiResult(null);
    try {
      if (hasPriceLookupIntent(aiPrompt)) {
        const requestedDate = parseRequestedDate(aiPrompt);
        if (!requestedDate) {
          setAiResult({
            error: 'I could not read that date. Try a clearer format like "price on 12 Feb 2025" or "open on 2025-02-12".',
          });
          return;
        }
        const candle = Array.isArray(chartData)
          ? chartData.find((d: any) => d.date?.toString().slice(0, 10) === requestedDate)
          : null;

        setAiResult({
          type: 'price_lookup',
          requestedDate,
          candle,
          nearest: getNearestCandles(chartData, requestedDate),
        });
        return;
      }

      const holdingPnl = resolveHoldingPnl(aiPrompt, chartData);
      if (holdingPnl) {
        setAiResult(holdingPnl);
        return;
      }

      const marketAnswer = buildMarketAnswer(aiPrompt, analysis, ticker, currency, chartData);
      if (marketAnswer) {
        setAiResult(marketAnswer);
        return;
      }

      const res = await fetch(`${BACKEND}/api/v1/backtest/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, prompt: aiPrompt })
      });
      const data = await res.json();
      if (!res.ok) {
        setAiResult({
          error: data?.detail || 'The strategy engine could not answer that yet. Try mentioning a ticker, price date, holding quantity, or buy/sell rule.',
        });
        return;
      }
      setAiResult({ type: 'strategy_test', ...data });
    } catch {
      setAiResult({ error: "Failed to connect to backend." });
    } finally {
      setIsAiRunning(false);
    }
  };

  // ── Enter key handler for AI search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && aiPrompt.trim() && !isAiRunning) {
      handleAiSearch();
    }
  };

  const topStrategies = normalizeStrategyEvals(analysis?.strategy_evals).slice(0, 10);
  const [showAllStrategies, setShowAllStrategies] = useState(false);

  return (
    <div className="flex flex-col gap-6">

      {/* ── Row 1: Verdict + Score + Key Metrics ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Verdict card */}
        <div className={`lg:col-span-3 rounded-3xl border backdrop-blur-2xl p-6 flex flex-col justify-between ${accentBg} ${accentGlow}`}>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">Algorithm Verdict</span>
            <div className={`text-5xl font-black uppercase tracking-tighter font-['Space_Grotesk'] ${accentColor} mb-4`}>{analysisView.displayVerdict}</div>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest block mb-2">Trade Setup</span>
            <div className="text-2xl font-['Space_Grotesk'] font-black text-white">{setupLabel}</div>
            <p className="text-[10px] text-zinc-400 mt-2 font-['JetBrains_Mono']">
              Target and stop loss are aligned with the displayed verdict.
            </p>
          </div>
        </div>

        {/* FISO Score */}
        <div className="lg:col-span-3 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">FISO Confidence Level</span>
          <div>
            <div className="flex items-end gap-1 mb-3">
              <span className="text-5xl font-['JetBrains_Mono'] font-bold text-white">{analysisView.confidenceLevel}</span>
              <span className="text-zinc-600 text-xl mb-1">/100</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden mb-4">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-zinc-400 to-green-400 transition-all duration-1000"
                style={{ width: `${analysisView.confidenceLevel}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {([
                ['Sell', analysisView.direction === 'bearish'],
                ['Buy', analysisView.direction === 'bullish'],
              ] as Array<[string, boolean]>).map(([label, active]) => (
                <div
                  key={label}
                  className={`rounded-lg py-1.5 text-[9px] font-bold uppercase tracking-widest font-['JetBrains_Mono'] ${
                    active
                      ? label === 'Buy'
                        ? 'bg-green-500/25 text-green-400'
                        : 'bg-red-500/25 text-red-400'
                      : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Price targets */}
        <div className="lg:col-span-6 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-4">Predictive Price Vectors</span>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Entry Price</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-white">{currency}{analysisView.entry?.toLocaleString()}</span>
              <span className="text-[9px] text-zinc-500 block mt-1">Current position</span>
            </div>
            <div className="bg-green-500/10 border border-green-400/30 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Target Price</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-green-400">{currency}{analysisView.target?.toLocaleString()}</span>
              <span className="text-[9px] text-green-500/70 block mt-1">
                {analysisView.direction === 'bearish' ? `${targetMovePct}% downside target` : `${targetMovePct}% upside target`}
              </span>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Stop Loss</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-red-400">{currency}{analysisView.stop_loss?.toLocaleString()}</span>
              <span className="text-[9px] text-red-500/70 block mt-1">
                {analysisView.direction === 'bearish' ? `${stopRiskPct}% upside risk` : `${stopRiskPct}% downside risk`}
              </span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Risk:Reward</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-white">1 : {rr}</span>
              <span className="text-[9px] text-zinc-500 block mt-1">per unit risk</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Trade Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 sm:p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">Trade Timeline</span>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between py-2.5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <span className="text-green-400 text-xs font-bold">T</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Target Date</span>
                  <span className="text-[10px] text-zinc-500">{analysis.target_date}</span>
                </div>
              </div>
              <span className="font-['JetBrains_Mono'] text-green-400 font-bold text-sm">{analysis.estimated_days}d</span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-zinc-400 text-xs font-bold">⚡</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Expected Move</span>
                  <span className="text-[10px] text-zinc-500">From current price</span>
                </div>
              </div>
              <span className={`font-['JetBrains_Mono'] font-bold text-sm ${analysisView.direction === 'bearish' ? 'text-red-400' : 'text-green-400'}`}>
                {analysisView.direction === 'bearish' ? '-' : '+'}{targetMovePct}%
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-zinc-400 text-xs font-bold">📊</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Max Risk</span>
                  <span className="text-[10px] text-zinc-500">If stop loss triggered</span>
                </div>
              </div>
              <span className="font-['JetBrains_Mono'] font-bold text-sm text-red-400">{stopRiskPct}%</span>
            </div>
          </div>
        </div>
        <div className="lg:col-span-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 sm:p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-4">Position Snapshot</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-2">Setup</span>
              <span className={`text-sm font-black uppercase font-['Space_Grotesk'] ${accentColor}`}>{analysisView.displayVerdict}</span>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-2">Risk:Reward</span>
              <span className="text-sm font-black text-white font-['JetBrains_Mono']">1 : {rr}</span>
            </div>
            <div className="col-span-2 rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Confidence</span>
                <span className="text-xs font-black text-white font-['JetBrains_Mono']">{analysisView.confidenceLevel}/100</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${analysisView.confidenceLevel}%` }} />
              </div>
            </div>
          </div>
      </div>
      </div>

      {/* ── Section 3: AI Market Search ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-cyan-500/12 via-black/45 to-fuchsia-500/10 backdrop-blur-2xl border border-cyan-400/25 rounded-3xl p-4 sm:p-6 shadow-[0_14px_40px_rgba(6,182,212,0.16)] ring-1 ring-cyan-400/10">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(217,70,239,0.10),transparent_30%)]" />
        <h3 className="relative text-[10px] font-bold text-cyan-200 tracking-[0.2em] uppercase mb-2 border-b border-cyan-300/15 pb-3 font-['Space_Grotesk'] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse inline-block"></span>
          AI Market Search
        </h3>
        <p className="relative text-[11px] text-cyan-100/75 font-['JetBrains_Mono'] mb-4">
          Ask Bullseye for dated prices, trade ideas, profit and loss checks, or custom backtests.
        </p>

        <div className="relative flex flex-col sm:flex-row gap-3">
          <input
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a price question or test a strategy, e.g. opening price on 12th Feb"
            className="flex-1 bg-white/8 border border-cyan-300/25 rounded-xl px-4 py-3.5 text-sm font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20 placeholder-cyan-100/40 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          />
          <button
            onClick={handleAiSearch}
            disabled={isAiRunning || !aiPrompt.trim()}
            className="bg-cyan-400/18 border border-cyan-300/55 text-cyan-200 font-bold uppercase tracking-widest text-xs px-6 py-3.5 rounded-xl hover:bg-cyan-400/28 transition-all disabled:opacity-40 font-['Space_Grotesk'] shrink-0 shadow-[0_12px_28px_rgba(34,211,238,0.12)]"
          >
            {isAiRunning ? 'Thinking...' : 'Ask AI'}
          </button>
        </div>

        {/* AI loading */}
        {isAiRunning && (
          <div className="mt-4 flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin shrink-0"></div>
            <span className="text-xs text-zinc-500 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">
              Reading market data for {ticker}...
            </span>
          </div>
        )}

        {/* AI results */}
        {aiResult && !isAiRunning && (
          <div className="mt-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {aiResult.error || aiResult.custom_metrics?.error ? (
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                <p className="text-red-400 text-sm font-['JetBrains_Mono']">
                  {aiResult.error || aiResult.custom_metrics?.error}
                </p>
              </div>
            ) : aiResult.type === 'holding_pnl' ? (
              <div className={`${aiResult.pnl >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'} border rounded-2xl p-4`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                  <div>
                    <span className={`text-[10px] uppercase tracking-widest font-bold font-['Space_Grotesk'] ${aiResult.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.pnl >= 0 ? 'Profit' : 'Loss'} estimate
                    </span>
                    <p className="text-sm text-zinc-400 font-['JetBrains_Mono'] mt-1">
                      {aiResult.quantity.toLocaleString()} shares from {aiResult.buyDate} to {aiResult.latestDate}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className={`text-2xl font-black font-['JetBrains_Mono'] ${aiResult.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.pnl >= 0 ? '+' : ''}{currency}{Math.abs(aiResult.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs font-bold font-['JetBrains_Mono'] ${aiResult.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.returnPct >= 0 ? '+' : ''}{aiResult.returnPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ['Buy price', aiResult.buyPrice],
                    ['Current close', aiResult.currentPrice],
                    ['Invested', aiResult.invested],
                    ['Current value', aiResult.currentValue],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                      <span className="text-lg font-['JetBrains_Mono'] font-bold text-white">
                        {currency}{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : aiResult.type === 'assistant_answer' ? (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold font-['Space_Grotesk']">{aiResult.title}</span>
                <p className="text-sm text-zinc-300 font-['JetBrains_Mono'] leading-relaxed mt-2 mb-4">{aiResult.answer}</p>
                {aiResult.rows?.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {aiResult.rows.map(([label, value]: [string, any]) => (
                      <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                        <span className="text-sm font-['JetBrains_Mono'] font-bold text-white break-words">
                          {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : aiResult.type === 'price_lookup' ? (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                {aiResult.candle ? (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold font-['Space_Grotesk']">Price Lookup</span>
                      <span className="text-[10px] text-zinc-500 font-['JetBrains_Mono']">{ticker} · {aiResult.requestedDate}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        ['Open', aiResult.candle.open],
                        ['High', aiResult.candle.high],
                        ['Low', aiResult.candle.low],
                        ['Close', aiResult.candle.close],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                          <span className="text-lg font-['JetBrains_Mono'] font-bold text-white">
                            {currency}{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-4">
                    <p className="text-cyan-200/80 text-sm font-['JetBrains_Mono']">
                      No candle found for {ticker} on {aiResult.requestedDate}. It may be a market holiday, weekend, or outside loaded chart history.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {([
                        ['Previous trading day', aiResult.nearest?.previous],
                        ['Next trading day', aiResult.nearest?.next],
                      ] as Array<[string, any]>).map(([label, candle]) => (
                        <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-2">{label}</span>
                          {candle ? (
                            <div className="grid grid-cols-2 gap-2 text-xs font-['JetBrains_Mono']">
                              <span className="text-cyan-300 col-span-2">{candle.day}</span>
                              <span>O: {currency}{Number(candle.open).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              <span>C: {currency}{Number(candle.close).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              <span>H: {currency}{Number(candle.high).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              <span>L: {currency}{Number(candle.low).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500 font-['JetBrains_Mono']">Not available in loaded data</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* 4 metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Total Trades',
                      value: aiResult.custom_metrics?.total_trades,
                      suffix: '',
                      color: 'text-white',
                      icon: '📈'
                    },
                    {
                      label: 'Win Rate',
                      value: aiResult.custom_metrics?.win_rate,
                      suffix: '%',
                      color: (aiResult.custom_metrics?.win_rate ?? 0) >= 50 ? 'text-green-400' : 'text-red-400',                      icon: '🎯'
                    },
                    {
                      label: 'Avg Return / Trade',
                      value: aiResult.custom_metrics?.avg_return_per_trade_pct,
                      suffix: '%',
                      color: (aiResult.custom_metrics?.avg_return_per_trade_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                      icon: '⚡'
                    },
                    {
                      label: 'Total Return',
                      value: aiResult.custom_metrics?.total_return_pct,
                      suffix: '%',
                      color: (aiResult.custom_metrics?.total_return_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                      icon: '💰'
                    },
                  ].map(({ label, value, suffix, color, icon }) => (
                    <div key={label} className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{icon}</span>
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold font-['Space_Grotesk']">{label}</span>
                      </div>
                      <span className={`text-xl font-['JetBrains_Mono'] font-bold ${color}`}>
                        {value !== undefined && value !== null ? `${value}${suffix}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-black font-['Space_Grotesk']">Strategy analysis</span>
                      <p className="mt-2 text-sm text-zinc-300 leading-relaxed font-['JetBrains_Mono']">
                        {aiResult.custom_metrics?.analysis_text || aiResult.custom_metrics?.warning || 'Strategy completed. Review the trade log below for entries and exits.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 shrink-0 min-w-[240px]">
                      {[
                        ['Wins', aiResult.custom_metrics?.summary?.wins ?? aiResult.custom_metrics?.wins ?? 0],
                        ['Losses', aiResult.custom_metrics?.summary?.losses ?? aiResult.custom_metrics?.losses ?? 0],
                        ['Best', `${aiResult.custom_metrics?.summary?.best_trade_pct ?? aiResult.custom_metrics?.best_trade_pct ?? 0}%`],
                        ['Worst', `${aiResult.custom_metrics?.summary?.worst_trade_pct ?? aiResult.custom_metrics?.worst_trade_pct ?? 0}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-black/25 border border-white/5 p-3">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block">{label}</span>
                          <span className="text-sm text-white font-bold font-['JetBrains_Mono']">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-black/25 border border-white/5 p-3">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Entry rule</span>
                      <span className="text-xs text-zinc-300 font-['JetBrains_Mono'] break-words">{aiResult.custom_metrics?.buy_expr}</span>
                    </div>
                    <div className="rounded-xl bg-black/25 border border-white/5 p-3">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Exit rule</span>
                      <span className="text-xs text-zinc-300 font-['JetBrains_Mono'] break-words">{aiResult.custom_metrics?.sell_expr}</span>
                    </div>
                  </div>
                </div>

                {aiResult.custom_metrics?.open_trade && (
                  <div className="mt-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                    <span className="text-[10px] text-amber-500 uppercase tracking-widest font-black font-['Space_Grotesk']">Open trade</span>
                    <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
                      {[
                        ['Buy date', `${aiResult.custom_metrics.open_trade.buy_date} (${aiResult.custom_metrics.open_trade.buy_day || '-'})`],
                        ['Buy price', aiResult.custom_metrics.open_trade.buy_price],
                        ['Target', aiResult.custom_metrics.open_trade.target_price ?? '-'],
                        ['Current', aiResult.custom_metrics.open_trade.current_price],
                        ['Return', `${aiResult.custom_metrics.open_trade.return_pct}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-black/25 border border-white/5 p-3">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block">{label}</span>
                          <span className="text-sm text-white font-bold font-['JetBrains_Mono']">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiResult.custom_metrics?.trades?.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
                    <div className="px-4 py-3 bg-black/30 border-b border-white/10 flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">Trade log</span>
                      <span className="text-[9px] text-zinc-500 font-['JetBrains_Mono']">Latest {aiResult.custom_metrics.trades.length}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-left">
                        <thead className="bg-black/20">
                          <tr>
                            {['Buy day', 'Buy date', 'Buy', 'Sell day', 'Sell date', 'Sell', 'Hold', 'Return', 'Result'].map(label => (
                              <th key={label} className="px-4 py-3 text-[9px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {aiResult.custom_metrics.trades.map((trade: any, index: number) => (
                            <tr key={`${trade.buy_date}-${trade.sell_date}-${index}`} className="border-t border-white/5">
                              <td className="px-4 py-3 text-xs text-zinc-300 font-['JetBrains_Mono']">{trade.buy_day || '-'}</td>
                              <td className="px-4 py-3 text-xs text-zinc-300 font-['JetBrains_Mono']">{trade.buy_date}</td>
                              <td className="px-4 py-3 text-xs text-white font-bold font-['JetBrains_Mono']">{currency}{trade.buy_price}</td>
                              <td className="px-4 py-3 text-xs text-zinc-300 font-['JetBrains_Mono']">{trade.sell_day || '-'}</td>
                              <td className="px-4 py-3 text-xs text-zinc-300 font-['JetBrains_Mono']">{trade.sell_date}</td>
                              <td className="px-4 py-3 text-xs text-white font-bold font-['JetBrains_Mono']">{currency}{trade.sell_price}</td>
                              <td className="px-4 py-3 text-xs text-zinc-300 font-['JetBrains_Mono']">{trade.holding_days}d</td>
                              <td className={`px-4 py-3 text-xs font-bold font-['JetBrains_Mono'] ${trade.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.return_pct}%</td>
                              <td className={`px-4 py-3 text-xs font-black font-['Space_Grotesk'] ${trade.result === 'WIN' ? 'text-green-400' : 'text-red-400'}`}>{trade.result}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Section 4: Bullseye Top 10 Recommended Strategies ── */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <span className="font-black text-black font-['Space_Grotesk'] text-sm">X</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase font-['Space_Grotesk']">
                <span className="tracking-widest"><span className="text-slate-950">BULLS</span><span className="text-cyan-500">EYE</span></span> will recommend
              </h3>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-['JetBrains_Mono']">
                Top 10 strategies ranked by signal score · Best fit first
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-full font-bold uppercase tracking-widest font-['JetBrains_Mono']">
              {topStrategies.length} Active Signals
            </span>
            {topStrategies.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllStrategies(prev => !prev)}
                className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-cyan-500 hover:bg-cyan-500/10 hover:border-cyan-400/40 transition-all flex items-center justify-center"
                aria-label={showAllStrategies ? 'Collapse strategies list' : 'Expand strategies list'}
                aria-expanded={showAllStrategies}
              >
                <span className={`text-sm transition-transform ${showAllStrategies ? 'rotate-180' : ''}`}>⌄</span>
              </button>
            )}
          </div>
        </div>

        {topStrategies.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-xs text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">Computing signal matrix...</span>
          </div>
        ) : (
          <div className={`overflow-hidden transition-all duration-300 ${showAllStrategies ? 'max-h-[2200px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="flex flex-col gap-3">
            {topStrategies.map((s: any, rank: number) => {
              const isBestFit = rank === 0;
              // Using #4ade80 for strong buy (green) and #f87171 for weak/sell (red)
              const scoreColor = s.score >= 80 ? '#4ade80' : s.score >= 60 ? '#86efac' : s.score >= 40 ? '#fbbf24' : '#f87171';
              return (
                <div
                  key={s.id}
                  className={`relative rounded-2xl p-4 transition-all duration-200 ${
                    isBestFit
                      ? 'bg-gradient-to-r from-cyan-900/30 to-fuchsia-900/10 border border-cyan-400/40 shadow-[0_0_25px_rgba(6,182,212,0.12)]'
                      : 'bg-black/30 border border-white/5 hover:border-white/15 hover:bg-white/3'
                  }`}
                >
                  <div className="flex items-start gap-4">

                    {/* Rank number */}
                    <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm font-['JetBrains_Mono'] ${
                      isBestFit ? 'bg-cyan-400 text-black' : 'bg-white/5 text-zinc-500'
                    }`}>
                      {String(rank + 1).padStart(2, '0')}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className={`font-bold text-sm uppercase font-['Space_Grotesk'] ${isBestFit ? 'text-white' : 'text-zinc-200'}`}>
                          {s.name}
                        </span>
                        {isBestFit && (
                          <span className="text-[8px] bg-cyan-400 text-black px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                            ★ Best Fit Strategy
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">{s.desc}</p>
                    </div>

                    {/* Score */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <span className="text-lg font-['JetBrains_Mono'] font-bold" style={{ color: scoreColor }}>
                        {s.score}
                      </span>
                      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, backgroundColor: scoreColor }} />
                      </div>
                      <span className="text-[8px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest">/100</span>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 5: Global NLP Feed (LAST) ── */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] mb-8">
        <div className="flex justify-between items-center mb-5 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block"></span>
            <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk']">Stock News</span>
          </div>
          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border font-['JetBrains_Mono']
            ${analysis?.sentiment?.label === 'Bullish' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
              analysis?.sentiment?.label === 'Bearish' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
              'bg-white/5 text-zinc-400 border-white/10'}`}>
            {analysis?.sentiment?.label || 'ANALYZING'} [{analysis?.sentiment?.score || 0}]
          </span>
        </div>

        <ul className="space-y-3">
          {analysis?.sentiment?.headlines?.map((h: string, i: number) => (
            <li key={i} className="text-xs text-zinc-300 leading-relaxed border-l-2 border-white/20 pl-4 py-1.5 hover:border-cyan-400 hover:text-white transition-all cursor-pointer group">
              <span className="text-[9px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest block mb-0.5 group-hover:text-cyan-400/70 transition-colors">
                Headline {String(i + 1).padStart(2, '0')}
              </span>
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 inline-block"></span>
          <span className="text-[9px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest">
            News sentiment derived via NLP - refreshed on each analysis
          </span>
        </div>
      </div>

    </div>
  );
};

const FundamentalsTable = ({
  title,
  subtitle,
  table,
  currency,
}: {
  title: string;
  subtitle: string;
  table: any;
  currency: string;
}) => {
  const columns = table?.columns ?? [];
  const rows = table?.rows ?? [];

  return (
    <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">{title}</h3>
          <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">{subtitle}</p>
        </div>
      </div>

      {rows.length === 0 || columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-xs text-zinc-500 font-['JetBrains_Mono']">
          This free data source does not expose this statement for the selected stock yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">Line Item</th>
                {columns.map((column: string) => (
                  <th key={column} className="px-4 py-3 text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="px-4 py-3 text-sm text-zinc-200 font-semibold whitespace-nowrap">{humanizeLabel(row.label)}</td>
                  {row.values.map((value: any, index: number) => (
                    <td key={`${row.label}-${index}`} className="px-4 py-3 text-sm text-white font-['JetBrains_Mono'] whitespace-nowrap">
                      {value === null || value === undefined
                        ? '-'
                        : Math.abs(Number(value)) >= 100000
                          ? formatCompactRupees(value)
                          : formatCurrencyNumber(value, currency, 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const IndiaDetailedAnalysisPanel = ({
  ticker,
  stock,
  currency,
  fundamentals,
  isLoading,
}: {
  ticker: string;
  stock: typeof STOCKS[number];
  currency: string;
  fundamentals: any;
  isLoading: boolean;
}) => {
  const summary = fundamentals?.summary ?? {};
  const company = fundamentals?.company ?? {};
  const ratios = (fundamentals?.ratios ?? []).filter((ratio: any) => ratio?.value !== null && ratio?.value !== undefined);
  const highlights = [
    { label: 'Market Cap', value: formatMarketCap(summary.market_cap, summary.market_cap_unit, currency) },
    { label: 'Current Price', value: formatCurrencyNumber(summary.current_price, currency, 2) },
    { label: '52W High / Low', value: summary.high_52_week && summary.low_52_week ? `${formatCurrencyNumber(summary.high_52_week, currency, 2)} / ${formatCurrencyNumber(summary.low_52_week, currency, 2)}` : '-' },
    { label: 'Trailing P/E', value: formatRatioValue(summary.trailing_pe) },
    { label: 'Book Value', value: formatCurrencyNumber(summary.book_value, currency, 2) },
    { label: 'Dividend Yield', value: formatRatioValue(summary.dividend_yield, 'percent') },
    { label: 'ROE', value: formatRatioValue(summary.return_on_equity, 'percent') },
    { label: 'Profit Margin', value: formatRatioValue(summary.profit_margins, 'percent') },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
          <span className="text-xs text-zinc-500 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">
            Loading free fundamentals for {ticker}...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">Indian Stock Analytics</h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">
                Free fundamentals pipeline for {stock.symbol} using cached market data.
              </p>
            </div>
            <span className="text-[10px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-full font-bold uppercase tracking-widest font-['JetBrains_Mono']">
              India only
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {highlights.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">{item.label}</div>
                <div className="mt-2 text-lg font-bold text-white font-['JetBrains_Mono'] break-words">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">About</h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">
                Company profile and business context
              </p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="text-zinc-200 leading-relaxed">
              {company.description || `${stock.name} detailed profile will expand as we ingest more NSE/BSE filings.`}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {[
                ['Sector', company.sector],
                ['Industry', company.industry],
                ['Website', company.website],
                ['Employees', company.employees ? formatIndianNumber(company.employees, 0) : null],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">{label}</div>
                  <div className="mt-2 text-sm text-white font-['JetBrains_Mono'] break-words">{value || '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <FundamentalsTable
        title="Quarterly Results"
        subtitle="Free statement data mapped from the latest available quarterly income rows."
        table={fundamentals?.statements?.quarterly_results}
        currency={currency}
      />

      <FundamentalsTable
        title="Profit & Loss"
        subtitle="Annual income statement history from the free backend dataset."
        table={fundamentals?.statements?.profit_and_loss}
        currency={currency}
      />

      <FundamentalsTable
        title="Balance Sheet"
        subtitle="Annual balance sheet rows normalized into a dashboard-ready table."
        table={fundamentals?.statements?.balance_sheet}
        currency={currency}
      />

      <FundamentalsTable
        title="Cash Flow"
        subtitle="Annual cash flow rows pulled into the India-only detailed view."
        table={fundamentals?.statements?.cash_flow}
        currency={currency}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">Key Ratios</h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">
                Highlights available from the free source for this stock.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ratios.length > 0 ? ratios.map((ratio: any) => (
              <div key={ratio.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">{ratio.label}</div>
                <div className="mt-2 text-lg font-bold text-white font-['JetBrains_Mono']">{formatRatioValue(ratio.value, ratio.kind)}</div>
              </div>
            )) : (
              <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-xs text-zinc-500 font-['JetBrains_Mono']">
                Ratio fields are not available yet for this symbol.
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">Next Free Upgrades</h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">
                Planned India-only sections without paid APIs.
              </p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-zinc-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-black font-['Space_Grotesk']">Peer comparison</div>
              <p className="mt-2 leading-relaxed">
                This will be generated from your own India stock database once sector and industry snapshots are indexed.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-black font-['Space_Grotesk']">Shareholding pattern</div>
              <p className="mt-2 leading-relaxed">
                This is the next public-data target from NSE/BSE corporate filings so you can keep the dashboard fully free.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-black font-['Space_Grotesk']">Source note</div>
              <p className="mt-2 leading-relaxed">
                Current detailed sections are served from the free backend pipeline so you can launch without charging users for fundamentals.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeMarket, setActiveMarket] = useState<MarketScope>('INDIA');
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview');
  const [chartRange, setChartRange] = useState<ChartRange>('1y');
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // ── Auth state ───────────────────────────────────────────────────────────
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [cachedChart, setCachedChart] = useState<any>(undefined);
  const [cachedAnalysis, setCachedAnalysis] = useState<any>(undefined);
  const [cachedFundamentals, setCachedFundamentals] = useState<any>(undefined);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef<any>(null);
  const selectedStock = ticker ? STOCKS.find(s => s.ticker === ticker) ?? null : null;
  const canOpenDetailedAnalysis = isIndianStock(selectedStock);

  // Check if Supabase is available
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseAvailable = !!(supabaseUrl && supabaseKey);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    if (!supabaseAvailable) {
      setAuthReady(true);
      return () => {};
    }

    setAuthReady(false);

    import('@supabase/supabase-js').then(({ createClient }) => {
      if (!mounted) return;

      if (!supabaseRef.current) {
        supabaseRef.current = createClient(supabaseUrl!, supabaseKey!);
      }

      const sb = supabaseRef.current;

      sb.auth.getSession().then((result: any) => {
        if (!mounted) return;
        setUser(result?.data?.session?.user ?? null);
        setAuthReady(true);
      });

      const authListener = sb.auth.onAuthStateChange((_event: string, session: any) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        setAuthReady(true);
        if (session?.user) {
          setShowAuthModal(false);
          setShowProfileMenu(false);
          setAuthEmail('');
          setAuthPassword('');
          setAuthError('');
          setAuthSuccess('');
        }
      });

      subscription = authListener.data.subscription;
    }).catch(() => {
      if (!mounted) return;
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [supabaseAvailable, supabaseKey, supabaseUrl]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!showProfileMenu) return;
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showProfileMenu]);

  const getSupabaseClient = async () => {
    if (supabaseRef.current) return supabaseRef.current;
    const { createClient } = await import('@supabase/supabase-js');
    supabaseRef.current = createClient(supabaseUrl!, supabaseKey!);
    return supabaseRef.current;
  };

  const handleGoogleSignIn = async () => {
    if (!supabaseAvailable) {
      setAuthError('Sign-in is not configured for this deployment yet.');
      return;
    }
    setAuthLoading(true);
    try {
      const sb = await getSupabaseClient();
      await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` }
      });
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!authEmail || !authPassword) { setAuthError('Please fill in all fields.'); return; }
    if (!supabaseAvailable) {
      setAuthError('Sign-in is not configured for this deployment yet.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');
    try {
      const sb = await getSupabaseClient();
      if (authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        if (data.user) {
          setUser(data.user);
          setShowAuthModal(false);
          setShowProfileMenu(false);
          setAuthEmail('');
          setAuthPassword('');
          goHome();
        }
        setAuthSuccess('Account created! Check your email to verify.');
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
        setUser(data.user ?? null);
        setShowAuthModal(false);
        setShowProfileMenu(false);
        setAuthEmail('');
        setAuthPassword('');
        goHome();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabaseAvailable) return;
    const sb = await getSupabaseClient();
    await sb.auth.signOut();
    setUser(null);
    setShowProfileMenu(false);
  };

  const applyUrlState = (search: string) => {
    const params = new URLSearchParams(search);
    const urlTicker = params.get('ticker');
    const requestedView: DashboardView = params.get('view') === 'details' ? 'details' : 'overview';

    if (!urlTicker) {
      setTicker(null);
      setDashboardView('overview');
      setCachedChart(undefined);
      setCachedAnalysis(undefined);
      setCachedFundamentals(undefined);
      setInput('');
      setShowSuggestions(false);
      return;
    }

    const stock = STOCKS.find(s => s.ticker === urlTicker);
    if (!stock) return;

    const market = resolveMarket(stock.exchange);
    setCachedChart(getCache(`chart:${stock.ticker}:${chartRange}`));
    setCachedAnalysis(getCache(`analysis:${stock.ticker}`));
    setCachedFundamentals(getCache(`fundamentals:${stock.ticker}`));
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setActiveMarket(market);
    setDashboardView(market === 'INDIA' ? requestedView : 'overview');
  };

  useEffect(() => {
    applyUrlState(window.location.search);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      applyUrlState(window.location.search);
      setShowProfileMenu(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ticker) {
      setCachedChart(undefined);
      setCachedAnalysis(undefined);
      setCachedFundamentals(undefined);
      return;
    }
    setCachedChart(getCache(`chart:${ticker}:${chartRange}`));
    setCachedAnalysis(getCache(`analysis:${ticker}`));
    setCachedFundamentals(getCache(`fundamentals:${ticker}`));
  }, [ticker, chartRange]);

  const { data: quote } = useSWR(ticker ? `/api/v1/quote/${ticker}` : null, fetcher, { refreshInterval: 10000 });
  const { data: chartData } = useSWR(ticker ? `/api/v1/chart/${ticker}?range=${chartRange}` : null, fetcher, {
    fallbackData: cachedChart,
    revalidateIfStale: !cachedChart,
    revalidateOnMount: !cachedChart,
  });
  const { data: analysis } = useSWR(ticker ? `/api/v1/analyze/${ticker}` : null, fetcher, {
    fallbackData: cachedAnalysis,
    revalidateIfStale: !cachedAnalysis,
    revalidateOnMount: !cachedAnalysis,
  });
  const { data: fundamentals, isLoading: fundamentalsLoading } = useSWR(
    ticker && dashboardView === 'details' && canOpenDetailedAnalysis ? `/api/v1/fundamentals/${ticker}` : null,
    fetcher,
    {
      fallbackData: cachedFundamentals,
      revalidateIfStale: !cachedFundamentals,
      revalidateOnMount: !cachedFundamentals,
    }
  );

  useEffect(() => {
    if (ticker && chartData) setCache(`chart:${ticker}:${chartRange}`, chartData);
  }, [chartData, chartRange, ticker]);

  useEffect(() => {
    if (ticker && analysis) setCache(`analysis:${ticker}`, analysis);
  }, [analysis, ticker]);

  useEffect(() => {
    if (ticker && fundamentals) setCache(`fundamentals:${ticker}`, fundamentals);
  }, [fundamentals, ticker]);

  useEffect(() => {
    if (input.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = input.trim().toLowerCase();
    const mapped = STOCKS.map(s => {
      const name = s.name.toLowerCase();
      const symbol = s.symbol.toLowerCase();
      const tickerValue = s.ticker.toLowerCase();
      const exactMatch = name.includes(q) || symbol.includes(q) || tickerValue.includes(q) ? 0 : 100;
      const tokenMatch = q.split(/\s+/).every(part => name.includes(part) || symbol.includes(part) || tickerValue.includes(part)) ? 1 : 100;
      const nameDist = getLevenshteinDistance(q, name);
      const symDist = getLevenshteinDistance(q, symbol);
      return { ...s, score: Math.min(exactMatch, tokenMatch, nameDist, symDist) };
    });
    const threshold = Math.max(5, Math.ceil(q.length * 0.45));
    setSuggestions(mapped.filter(s => s.score <= threshold).sort((a, b) => a.score - b.score).slice(0, 8));
    setShowSuggestions(true);
  }, [input]);

  useEffect(() => {
    if (!ticker || !chartData || !chartRef.current || !Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';
    let cleanup = () => {};
    let cancelled = false;
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      if (cancelled || !chartRef.current) return;
      const container = chartRef.current;
      const chart = createChart(container, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 320,
        layout: { background: { color: 'transparent' }, textColor: '#475569' },
        grid: { vertLines: { color: 'rgba(15,23,42,0.08)' }, horzLines: { color: 'rgba(15,23,42,0.08)' } },
        crosshair: { mode: 1 },
      });
      
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444',
        borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444'
      });
      const formattedData = chartData
        .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
        .map((d: any) => ({
          time: chartRange === '1d' || chartRange === '1w'
            ? Math.floor(new Date(d.date).getTime() / 1000)
            : d.date?.toString().slice(0, 10),
          open: parseFloat(d.open), high: parseFloat(d.high),
          low: parseFloat(d.low), close: parseFloat(d.close),
        }));
      candleSeries.setData(formattedData);
      chart.timeScale().fitContent();
      const resizeObserver = new ResizeObserver(() => {
        chart.applyOptions({
          width: container.clientWidth || 800,
          height: container.clientHeight || 320,
        });
        chart.timeScale().fitContent();
      });
      resizeObserver.observe(container);
      cleanup = () => {
        resizeObserver.disconnect();
        chart.remove();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [chartData, chartRange, ticker]);

  const openStockView = (stock: typeof STOCKS[0], nextView: DashboardView = 'overview') => {
    const market = resolveMarket(stock.exchange);
    const resolvedView = market === 'INDIA' ? nextView : 'overview';
    setCachedChart(getCache(`chart:${stock.ticker}:${chartRange}`));
    setCachedAnalysis(getCache(`analysis:${stock.ticker}`));
    setCachedFundamentals(getCache(`fundamentals:${stock.ticker}`));
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setActiveMarket(market);
    setDashboardView(resolvedView);
    setInput('');
    setShowSuggestions(false);
    const nextUrl = resolvedView === 'details'
      ? `/?ticker=${encodeURIComponent(stock.ticker)}&view=details`
      : `/?ticker=${encodeURIComponent(stock.ticker)}`;
    window.history.pushState({ view: 'stock', ticker: stock.ticker, dashboardView: resolvedView }, '', nextUrl);
  };

  const selectStock = (stock: typeof STOCKS[0]) => {
    openStockView(stock, 'overview');
  };

  const openDetailedAnalysis = () => {
    if (!selectedStock || !canOpenDetailedAnalysis) return;
    openStockView(selectedStock, 'details');
  };

  const openOverview = () => {
    if (!selectedStock) return;
    openStockView(selectedStock, 'overview');
  };

  const goHome = () => {
    setTicker(null);
    setDashboardView('overview');
    setCachedFundamentals(undefined);
    setShowProfileMenu(false);
    window.history.pushState({ view: 'home' }, '', '/');
  };

  const getMarketStocks = () => {
    if (activeMarket === 'INDIA') return STOCKS.filter(s => s.exchange === 'NSE' || s.exchange === 'BSE').slice(0, 24);
    if (activeMarket === 'US') return STOCKS.filter(s => s.exchange === 'NASDAQ' || s.exchange === 'NYSE').slice(0, 24);
    return [];
  };

  // ── Prefetch cache: ticker → analysis result ──────────────────────────────
  const [prefetchCache, setPrefetchCache] = useState<Record<string, any>>({});
  const prefetchedRef = useRef<Set<string>>(new Set());

  // Hydrate visible cards from browser cache, then batch-fetch fresh analysis
  // so every visible card can show its verdict without opening the preview.
  useEffect(() => {
    setExpandedTicker(null);
    const visibleStocks = getMarketStocks();
    const cachedVisible = visibleStocks.reduce((acc, stock) => {
      const cached = getCache(`analysis:${stock.ticker}`);
      if (cached) acc[stock.ticker] = cached;
      return acc;
    }, {} as Record<string, any>);

    if (Object.keys(cachedVisible).length > 0) {
      setPrefetchCache(prev => ({ ...cachedVisible, ...prev }));
      Object.keys(cachedVisible).forEach(t => prefetchedRef.current.add(t));
    }

    const toFetch = visibleStocks.filter(s => !prefetchedRef.current.has(s.ticker));
    if (toFetch.length === 0) return;

    // Mark them as queued immediately so tab switches don't re-queue
    toFetch.forEach(s => prefetchedRef.current.add(s.ticker));

    toFetch.forEach((stock, i) => {
      setTimeout(async () => {
        try {
          const res = await fetch(`${BACKEND}/api/v1/analyze/${stock.ticker}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data && !data.error) {
            setCache(`analysis:${stock.ticker}`, data);
            setPrefetchCache(prev => ({ ...prev, [stock.ticker]: data }));
          }
        } catch {
          // silently ignore — card will fall back to on-demand fetch on hover
        }
      }, i * 400); // 400ms stagger = 24 stocks complete in ~10s background
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMarket]);

  const dashboardAnalysisView = getAnalysisPresentation(analysis);
  const isBull = dashboardAnalysisView?.isBullish;
  const isHold = dashboardAnalysisView?.isHold;
  const accentColor = isBull ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : isHold ? 'text-zinc-300' : 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]';

  const TickerContent = () => (
    <>
      <TickerItem title="NIFTY 50" symbol="^NSEI" currency="" />
      <TickerItem title="SENSEX" symbol="^BSESN" currency="" />
      <TickerItem title="NASDAQ" symbol="^IXIC" currency="" />
      <TickerItem title="S&P 500" symbol="^GSPC" currency="" />
    </>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;500;600&display=swap');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 35s linear infinite; }
        @keyframes dataDrift { 0% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(14px, -10px, 0); } 100% { transform: translate3d(0, 0, 0); } }
        @keyframes scanLine { 0% { transform: translateX(-30%); opacity: 0; } 18%, 72% { opacity: 0.55; } 100% { transform: translateX(130%); opacity: 0; } }
        .bullseye-light {
          background:
            radial-gradient(circle at 16% 8%, rgba(6,182,212,0.22), transparent 30%),
            radial-gradient(circle at 82% 6%, rgba(16,185,129,0.18), transparent 28%),
            linear-gradient(180deg, #f8fcff 0%, #edf7f8 45%, #ffffff 100%);
          color: #0f172a !important;
        }
        .bullseye-light video { display: none; }
        .bullseye-light [class*="bg-black"],
        .bullseye-light [class*="bg-zinc-950"],
        .bullseye-light [class*="bg-zinc-900"] {
          background-color: rgba(255,255,255,0.78) !important;
          backdrop-filter: blur(18px);
        }
        .bullseye-light [class*="border-white"] { border-color: rgba(15,23,42,0.10) !important; }
        .bullseye-light [class*="text-white"],
        .bullseye-light [class*="text-zinc-200"],
        .bullseye-light [class*="text-zinc-300"] { color: #0f172a !important; }
        .bullseye-light [class*="text-zinc-400"],
        .bullseye-light [class*="text-zinc-500"],
        .bullseye-light [class*="text-zinc-600"] { color: #64748b !important; }
        .bullseye-light input {
          background: rgba(255,255,255,0.92) !important;
          color: #0f172a !important;
          border-color: rgba(8,145,178,0.35) !important;
          box-shadow: 0 12px 40px rgba(15,23,42,0.08);
        }
        .bullseye-light input::placeholder { color: #94a3b8 !important; }
        .bullseye-light .fixed.inset-0.z-0 {
          background: transparent !important;
        }
        .brand-mark {
          box-shadow: 0 16px 40px rgba(8,145,178,0.22), inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .market-visual {
          background-image:
            linear-gradient(120deg, rgba(6,182,212,0.13), transparent 28%, rgba(16,185,129,0.10) 62%, transparent),
            linear-gradient(rgba(8,145,178,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(8,145,178,0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, black 0%, transparent 76%);
        }
        .market-card-float {
          animation: dataDrift 8s ease-in-out infinite;
        }
        .market-scan {
          animation: scanLine 6s ease-in-out infinite;
        }
        .disclaimer-panel {
          background: linear-gradient(135deg, rgba(255,251,235,0.98), rgba(254,243,199,0.92)) !important;
          border-color: rgba(217,119,6,0.34) !important;
          box-shadow: 0 16px 42px rgba(146,64,14,0.10);
        }
        .disclaimer-panel, .disclaimer-panel * {
          color: #78350f !important;
        }
        .force-light-text {
          color: #ffffff !important;
        }
        .stock-view-toggle-active {
          color: #083344 !important;
          background: rgba(207, 250, 254, 0.96) !important;
          border-color: rgba(6, 182, 212, 0.45) !important;
          box-shadow: 0 12px 28px rgba(6, 182, 212, 0.16);
        }
        .stock-view-toggle-idle {
          color: #475569 !important;
          background: rgba(255, 255, 255, 0.72) !important;
          border-color: rgba(148, 163, 184, 0.30) !important;
        }
      `}} />

      <div className="bullseye-light min-h-screen text-slate-900 selection:bg-cyan-500/20 selection:text-slate-950 flex flex-col font-['Inter']">

        {/* BACKGROUND */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 market-visual opacity-90" />
          <div className="market-scan absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent blur-xl" />
        </div>

        {/* TICKER TAPE */}
        <div className="relative z-20 w-full bg-black/60 backdrop-blur-xl border-b border-white/10 overflow-hidden py-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex w-[200%] sm:w-[150%] md:w-full">
            <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0"><TickerContent /></div>
            <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0"><TickerContent /></div>
          </div>
        </div>

        {/* NAV */}
        <nav className="relative z-20 w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-8 max-w-[1600px] mx-auto border-b border-white/5 bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-start cursor-pointer group shrink-0 w-full md:w-auto" onClick={goHome}>
            <div className="flex items-center gap-3">
              <div className="brand-mark w-11 h-11 rounded-2xl bg-gradient-to-br from-white via-cyan-100 to-emerald-100 border border-cyan-200 flex items-center justify-center">
                <span className="font-black text-cyan-700 font-['Space_Grotesk'] text-base">BE</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-[0.18em] uppercase font-['Space_Grotesk']">
                <span className="text-slate-950">BULLS</span><span className="text-cyan-500">EYE</span>
              </h1>
            </div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1 ml-[48px] font-['Space_Grotesk'] font-bold hidden sm:block">
              AI-Powered Market Intelligence
            </p>
          </div>

          <div className="flex-1 w-full max-w-4xl relative">
            <div className="absolute inset-0 bg-cyan-500/5 rounded-2xl blur-lg"></div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={(e) => { if (e.key === 'Enter' && suggestions.length > 0) selectStock(suggestions[0]); }}
              className="relative z-10 w-full bg-black/60 backdrop-blur-2xl border border-white/10 hover:border-cyan-500/50 px-5 sm:px-8 py-4 sm:py-5 rounded-2xl text-sm sm:text-base font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all placeholder-zinc-500 shadow-2xl tracking-widest uppercase"
              placeholder="SEARCH ASSETS. NOT HOPE."
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-black/95 backdrop-blur-3xl border border-white/10 rounded-2xl mt-2 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
                {suggestions.map((stock) => (
                  <div key={stock.ticker} onMouseDown={() => selectStock(stock)} className="flex justify-between items-center px-5 py-3.5 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 group transition-all">
                    <span className="font-bold text-sm text-zinc-300 group-hover:text-white uppercase tracking-wider font-['Space_Grotesk']">{stock.name}</span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-zinc-500 font-['JetBrains_Mono'] uppercase">{stock.exchange}</span>
                      <span className="text-xs font-['JetBrains_Mono'] text-cyan-500/70 group-hover:text-cyan-400">{stock.symbol}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account menu */}
          <div ref={accountMenuRef} className="relative shrink-0 self-end md:self-auto">
            <button
              type="button"
              onClick={() => setShowProfileMenu(prev => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowProfileMenu(prev => !prev);
                }
              }}
              className="h-12 w-12 rounded-full bg-white border border-cyan-200 text-cyan-700 font-black uppercase flex items-center justify-center shadow-[0_12px_32px_rgba(6,182,212,0.16)] hover:bg-cyan-50 hover:border-cyan-400 transition-all overflow-hidden"
              title={user ? 'Open user dashboard' : 'Open account menu'}
              aria-label={user ? 'Open user dashboard' : 'Open account menu'}
              aria-expanded={showProfileMenu}
            >
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : user ? (
                (user.user_metadata?.full_name || user.email || 'U').slice(0, 1)
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-3 z-50 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_28px_65px_rgba(15,23,42,0.28)] p-4 sm:p-5">
                {authReady && user ? (
                  <>
                    <div className="flex items-center gap-3 border-b border-slate-200 pb-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-cyan-100 text-cyan-700 font-black flex items-center justify-center overflow-hidden shrink-0">
                        {user.user_metadata?.avatar_url ? (
                          <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          (user.user_metadata?.full_name || user.email || 'U').slice(0, 1)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-sm truncate font-['Space_Grotesk']">{user.user_metadata?.full_name || 'Signed in user'}</div>
                        <div className="text-xs text-slate-500 truncate font-['JetBrains_Mono']">{user.email}</div>
                      </div>
                    </div>
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-widest text-cyan-700 font-black font-['Space_Grotesk']">Dashboard</div>
                      <div className="text-xs text-slate-500 mt-1 font-['JetBrains_Mono']">Your signed-in Bullseye workspace</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Market</span>
                        <div className="text-sm font-bold">{activeMarket}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Viewing</span>
                        <div className="text-sm font-bold truncate">{ticker || 'Overview'}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Saved scans</span>
                        <div className="text-sm font-bold">{Object.keys(prefetchCache).length}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Cache</span>
                        <div className="text-sm font-bold">{cachedAnalysis ? 'Ready' : 'Live'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="force-light-text w-full rounded-xl bg-slate-900 py-3 text-xs font-black uppercase tracking-widest font-['Space_Grotesk'] hover:bg-slate-700 transition-colors"
                    >
                      Sign Out
                    </button>
                  </>
                ) : !authReady && supabaseAvailable ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-6">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-widest text-cyan-700 font-black font-['Space_Grotesk']">Loading Account</div>
                      <div className="text-xs text-slate-500 mt-1 font-['JetBrains_Mono']">Checking your sign-in session...</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-widest text-cyan-700 font-black font-['Space_Grotesk']">Account</div>
                      <div className="text-xs text-slate-500 mt-1 font-['JetBrains_Mono']">Sign in to open your Bullseye dashboard.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowProfileMenu(false); setShowAuthModal(true); }}
                      className="force-light-text w-full rounded-xl bg-slate-900 py-3 text-xs font-black uppercase tracking-widest font-['Space_Grotesk'] hover:bg-slate-700 transition-colors"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* MAIN */}
        <main className="relative z-10 flex-1 w-full max-w-[1600px] mx-auto p-3 sm:p-6 lg:p-8 flex flex-col gap-6">

          {/* ── VIEW 1: DISCOVERY HUB ── */}
          {!ticker && (
            <div className="animate-in fade-in duration-700 w-full flex flex-col gap-6">

              {/* Market tabs */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                {(['INDIA', 'US'] as const).map(market => (
                  <button key={market} onClick={() => setActiveMarket(market)}
                    className={`p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border backdrop-blur-xl transition-all flex flex-col items-start
                      ${activeMarket === market
                        ? market === 'INDIA' ? 'bg-cyan-900/30 border-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]'
                        : 'bg-fuchsia-900/30 border-fuchsia-400/50 shadow-[0_0_30px_rgba(217,70,239,0.2)]'
                        : 'bg-black/40 border-white/10 hover:bg-white/5 hover:border-white/30'}`}>
                    <span className={`text-2xl sm:text-4xl mb-2 sm:mb-4 ${activeMarket === market ? 'opacity-100' : 'opacity-40'}`}>
                      {market === 'INDIA' ? '🇮🇳' : '🇺🇸'}
                    </span>
                    <span className={`text-base sm:text-2xl font-black uppercase tracking-tight font-['Space_Grotesk']
                      ${activeMarket === market ? 'text-white' : 'text-zinc-400'}`}>
                      {market === 'INDIA' ? 'India' : 'US'}
                    </span>
                    <span className={`text-[9px] sm:text-[10px] font-['JetBrains_Mono'] mt-1 sm:mt-2 uppercase tracking-widest hidden sm:block
                      ${activeMarket === market
                        ? market === 'INDIA' ? 'text-cyan-400' : 'text-fuchsia-400'
                        : 'text-zinc-600'}`}>
                      {market === 'INDIA' ? 'NSE / BSE' : 'NASDAQ / NYSE'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Asset grid */}
              <div className="bg-black/20 backdrop-blur-md rounded-3xl p-4 sm:p-6 border border-white/5 animate-in slide-in-from-bottom-8 fade-in duration-500">
                <div className="flex items-center justify-between mb-4 sm:mb-6 px-2 border-b border-white/10 pb-4">
                  <h2 className="text-xs sm:text-sm font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk']">Live Scan</h2>
                  <span className="text-[10px] bg-white/10 px-3 py-1 rounded-full text-zinc-300 font-['JetBrains_Mono']">{activeMarket}</span>
                </div>
                <div className="grid items-start grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                  {getMarketStocks().map(s => (
                    <MarketAssetCard
                      key={s.ticker}
                      stock={s}
                      onSelect={selectStock}
                      prefetchedAnalysis={prefetchCache[s.ticker]}
                      expanded={expandedTicker === s.ticker}
                      onToggle={(nextTicker) => setExpandedTicker(current => current === nextTicker ? null : nextTicker)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW 2: STOCK DASHBOARD ── */}
          {ticker && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full flex flex-col gap-6">

              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between border-b border-white/10 pb-5 gap-3">
                <div>
                  <button onClick={goHome}
                    className="text-zinc-400 font-bold uppercase text-[10px] hover:text-white transition-colors flex items-center gap-2 tracking-[0.2em] mb-3 bg-white/5 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                    ← Overview
                  </button>
                  <h1 className="font-black text-4xl sm:text-5xl lg:text-6xl text-white uppercase tracking-tighter font-['Space_Grotesk']">{ticker}</h1>
                  {selectedStock?.name && (
                    <div className="mt-2 text-sm text-zinc-500 font-['JetBrains_Mono']">{selectedStock.name}</div>
                  )}
                </div>
                <div className="flex flex-col sm:items-end gap-3">
                  {canOpenDetailedAnalysis && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openOverview}
                        className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] font-['Space_Grotesk'] transition-all ${
                          dashboardView === 'overview'
                            ? 'stock-view-toggle-active'
                            : 'stock-view-toggle-idle hover:bg-white'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={openDetailedAnalysis}
                        className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] font-['Space_Grotesk'] transition-all ${
                          dashboardView === 'details'
                            ? 'stock-view-toggle-active'
                            : 'stock-view-toggle-idle hover:bg-white'
                        }`}
                      >
                        Detailed Analysis
                      </button>
                    </div>
                  )}
                {quote?.price && (
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Live Price</div>
                    <span className="text-3xl sm:text-4xl font-['JetBrains_Mono'] font-bold text-white tracking-tight">{currency}{quote.price.toLocaleString()}</span>
                    <div className={`text-sm font-['JetBrains_Mono'] font-bold mt-1 tracking-wider ${quote.change_percent > 0 ? 'text-green-400' : 'text-red-500'}`}>
                      {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                    </div>
                  </div>
                )}
                </div>
              </div>

              {/* Chart */}
              <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 border-b border-white/10 pb-3">
                  <span className="font-bold text-xs text-zinc-400 uppercase tracking-[0.2em] font-['Space_Grotesk']">Chart Geometry</span>
                  <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 p-1 shadow-sm">
                    {([
                      ['1d', '1D'],
                      ['1w', '1W'],
                      ['1mo', '1M'],
                      ['1y', '1Y'],
                    ] as Array<[ChartRange, string]>).map(([range, label]) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setChartRange(range)}
                        className={`h-8 min-w-10 rounded-full px-3 text-[10px] font-black font-['JetBrains_Mono'] transition-all ${
                          chartRange === range
                            ? 'bg-slate-950 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {analysis && !analysis.error && (
                    <span className={`text-xs font-black uppercase tracking-widest font-['Space_Grotesk'] ${accentColor}`}>{dashboardAnalysisView?.displayVerdict}</span>
                  )}
                </div>
                {!chartData ? (
                  <div className="h-[260px] sm:h-[320px] flex flex-col items-center justify-center font-['JetBrains_Mono'] text-zinc-500 gap-4 text-xs sm:text-sm uppercase tracking-widest">
                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
                    Loading Data Stream...
                  </div>
                ) : (
                  <div className="w-full overflow-hidden rounded-2xl border border-white/5 bg-white/3">
                    <div ref={chartRef} className="w-full h-[260px] sm:h-[320px] overflow-hidden" />
                  </div>
                )}
              </div>

              {/* FISO Analysis + all sections in order */}
              {dashboardView === 'details' && selectedStock && canOpenDetailedAnalysis ? (
                <IndiaDetailedAnalysisPanel
                  ticker={ticker}
                  stock={selectedStock}
                  currency={currency}
                  fundamentals={fundamentals}
                  isLoading={fundamentalsLoading && !fundamentals}
                />
              ) : analysis && !analysis.error ? (
                <FisoDetailPanel analysis={analysis} currency={currency} ticker={ticker} chartData={chartData} />
              ) : !analysis && (
                <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
                    <span className="text-xs text-zinc-500 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">Running FISO Algorithm...</span>
                  </div>
                </div>
              )}

              {/* ── DISCLAIMER ── shown after every analysis */}
              {((dashboardView === 'overview' && analysis && !analysis.error) || dashboardView === 'details') && (
                <div className="disclaimer-panel rounded-2xl p-4 flex gap-3">
                  <span className="text-amber-400 text-lg shrink-0 mt-0.5">⚠️</span>
                  <p className="text-[11px] font-['JetBrains_Mono'] leading-relaxed font-semibold">
                    <span className="font-black">Disclaimer: </span>
                    Bullseye is an AI-powered predictive tool and is NOT a SEBI-registered investment advisor.
                    Predictions generated by the app are for educational and informational purposes only,
                    and should not be construed as financial or investment advice. Invest at your own risk.
                  </p>
                </div>
              )}

            </div>
          )}
        </main>
      </div>

      {/* ── AUTH MODAL ── */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(6,182,212,0.15)]">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-600 flex items-center justify-center">
                  <span className="font-black text-black text-sm">B</span>
                </div>
                <h2 className="text-lg font-black text-white tracking-widest uppercase font-['Space_Grotesk']">
                  <span className="text-white">BULLS</span><span className="text-cyan-500">EYE</span>
                </h2>
              </div>
              <button onClick={() => { setShowAuthModal(false); setAuthError(''); setAuthSuccess(''); }}
                className="text-zinc-500 hover:text-white transition-colors text-xl">✕</button>
            </div>

            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-3 rounded-xl mb-4 hover:bg-zinc-100 transition-all disabled:opacity-50 font-['Space_Grotesk']"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/10"></div>
              <span className="text-[10px] text-zinc-600 font-['Space_Grotesk'] uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>

            {/* Tab switcher */}
            <div className="flex bg-white/5 rounded-xl p-1 mb-4">
              {(['signin', 'signup'] as const).map(mode => (
                <button key={mode} onClick={() => { setAuthMode(mode); setAuthError(''); setAuthSuccess(''); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest font-['Space_Grotesk'] transition-all ${
                    authMode === mode ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {/* Email input */}
            <input
              type="email"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              placeholder="Email address"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 placeholder-zinc-600 transition-all mb-3"
            />

            {/* Password input */}
            <input
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
              placeholder="Password"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 placeholder-zinc-600 transition-all mb-4"
            />

            {/* Error / success messages */}
            {authError && <p className="text-red-400 text-xs font-['JetBrains_Mono'] mb-3">{authError}</p>}
            {authSuccess && <p className="text-green-400 text-xs font-['JetBrains_Mono'] mb-3">{authSuccess}</p>}

            {/* Submit button */}
            <button
              onClick={handleEmailAuth}
              disabled={authLoading}
              className="force-light-text w-full bg-slate-950 border border-slate-800 font-bold uppercase tracking-widest text-sm py-3 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-40 font-['Space_Grotesk']"
            >
              {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>

            <p className="text-[9px] text-zinc-600 text-center mt-4 font-['JetBrains_Mono']">
              By signing in you agree that Bullseye is not a SEBI-registered advisor. Invest at your own risk.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
