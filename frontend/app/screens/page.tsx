'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { STOCKS } from '../stocks';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL
  || (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000'
    : 'https://ai-trading-backend-jhcl.onrender.com');

type Stock = typeof STOCKS[number];
type AiMode = 'screen' | 'price' | 'backtest' | 'answer';

type ScreenItem = {
  title: string;
  description: string;
  prompt: string;
  tags: string[];
};

type ScreenSection = {
  title: string;
  subtitle: string;
  items: ScreenItem[];
};

type AiResult = {
  mode: AiMode;
  title: string;
  summary: string;
  sql?: string;
  python?: string;
  rows?: Stock[];
  ticker?: string;
  priceRows?: Array<[string, string]>;
  backtest?: BacktestResponse;
  error?: string;
};

type ChartRow = {
  date?: string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
};

type ChartCandle = ChartRow & { day: string };

type BacktestMetrics = {
  error?: string;
  analysis_text?: string;
  warning?: string;
  total_trades?: number;
  win_rate?: number;
  avg_return_per_trade_pct?: number;
  total_return_pct?: number;
};

type BacktestResponse = {
  detail?: string;
  custom_metrics?: BacktestMetrics;
};

const SCREEN_SECTIONS: ScreenSection[] = [
  {
    title: 'Popular themes',
    subtitle: 'Popular investing themes',
    items: [
      {
        title: 'Low on 10 year average earnings',
        description: 'Graham-style value screen using long-term average earnings.',
        prompt: 'Find stocks trading low versus 10 year average earnings',
        tags: ['value', 'graham', 'earnings'],
      },
      {
        title: 'Capacity expansion',
        description: 'Companies undergoing major fixed asset or CWIP expansion.',
        prompt: 'Find companies with capacity expansion and rising fixed assets',
        tags: ['capex', 'expansion'],
      },
      {
        title: 'Debt reduction...',
        description: 'Companies reducing leverage while continuing expansion.',
        prompt: 'Find companies reducing debt with expansion',
        tags: ['debt', 'balance sheet'],
      },
      {
        title: 'Companies creating new high',
        description: 'Companies with current price around 52 week high.',
        prompt: 'Find stocks near 52 week high',
        tags: ['momentum', '52 week high'],
      },
      {
        title: 'Growth without dilution',
        description: 'Companies with less than 10 percent dilution over 10 years.',
        prompt: 'Find growth stocks without dilution',
        tags: ['growth', 'dilution'],
      },
      {
        title: 'FII Buying',
        description: 'Stocks where foreign institutional investors are buying.',
        prompt: 'Find stocks with FII buying',
        tags: ['fii', 'ownership'],
      },
    ],
  },
  {
    title: 'Popular formulas',
    subtitle: 'Screening formulas based on books',
    items: [
      {
        title: 'Piotroski Scan',
        description: 'Companies with Piotroski score of 9 across profitability, leverage, and efficiency.',
        prompt: 'Find Piotroski score 9 companies',
        tags: ['quality', 'piotroski'],
      },
      {
        title: 'Magic Formula',
        description: 'Based on the famous Magic Formula.',
        prompt: 'Find Magic Formula stocks with high return on capital and earnings yield',
        tags: ['quality', 'value'],
      },
      {
        title: 'Coffee Can Portfolio',
        description: 'Based on the book by Saurabh Mukherjea.',
        prompt: 'Find Coffee Can portfolio stocks with high ROCE and sales growth',
        tags: ['quality', 'compounders'],
      },
    ],
  },
  {
    title: 'Price or Volume',
    subtitle: 'Screens based on price or volume action',
    items: [
      {
        title: 'Darvas Scan',
        description: 'Within 10 percent of 52w high, volume above 100000, and price above 10.',
        prompt: 'Darvas scan stocks within 10 percent of 52 week high and high volume',
        tags: ['darvas', 'volume'],
      },
      {
        title: 'Golden Crossover',
        description: 'When 50 DMA moves above 200 DMA from below.',
        prompt: 'Find stocks with golden crossover 50 DMA above 200 DMA',
        tags: ['technical', 'crossover'],
      },
      {
        title: 'Bearish Crossovers',
        description: '50 day moving average cuts the 200 day moving average from above.',
        prompt: 'Find bearish crossover stocks where 50 DMA cuts 200 DMA from above',
        tags: ['technical', 'bearish'],
      },
      {
        title: 'Price Volume Action',
        description: 'Weekly volumes up more than 5x and price movement positive.',
        prompt: 'Find stocks with weekly volume increased 5x and positive price action',
        tags: ['volume', 'momentum'],
      },
      {
        title: 'RSI - Oversold Stocks',
        description: 'Stocks with RSI less than 30.',
        prompt: 'Find oversold stocks with RSI below 30',
        tags: ['rsi', 'oversold'],
      },
    ],
  },
  {
    title: 'Quarterly results',
    subtitle: 'Screens around latest quarterly results',
    items: [
      {
        title: 'The Bull Cartel',
        description: 'Companies with good quarterly growth.',
        prompt: 'Find companies with strong latest quarterly growth',
        tags: ['quarterly', 'growth'],
      },
      {
        title: 'Quarterly Growers',
        description: 'Q0 > Q1 > Q2 > Q3.',
        prompt: 'Find quarterly growers where recent quarter is better than previous quarters',
        tags: ['quarterly', 'trend'],
      },
      {
        title: 'Best of latest quarter',
        description: 'Companies with the best latest quarterly numbers.',
        prompt: 'Find companies with best latest quarter results',
        tags: ['quarterly', 'results'],
      },
      {
        title: 'All Latest QTR Results [Date Wise]',
        description: 'All latest quarterly results with profits.',
        prompt: 'Show latest quarterly results with profits date wise',
        tags: ['quarterly', 'profits'],
      },
    ],
  },
  {
    title: 'Valuation Screens',
    subtitle: 'Screens based on stock valuations',
    items: [
      {
        title: 'Highest Dividend Yield Shares',
        description: 'Stocks consistently paying dividends, sorted by highest yield.',
        prompt: 'Find highest dividend yield shares',
        tags: ['dividend', 'yield'],
      },
      {
        title: 'Loss to Profit Companies',
        description: 'Companies that turned from loss to profit.',
        prompt: 'Find loss to profit turnaround companies',
        tags: ['turnaround', 'profits'],
      },
      {
        title: 'FCF yield',
        description: 'Companies with good free cash flow yield and growth.',
        prompt: 'Find stocks with high FCF yield and growth',
        tags: ['fcf', 'valuation'],
      },
      {
        title: 'High Ratio of Market Value of Investments',
        description: 'Companies with high market value of investments.',
        prompt: 'Find companies with high ratio of market value of investments',
        tags: ['investments', 'holding'],
      },
      {
        title: 'Book value over 5 times price',
        description: 'High book value compared with price.',
        prompt: 'Find stocks where book value is over 5 times price',
        tags: ['book value', 'deep value'],
      },
    ],
  },
  {
    title: 'Popular stock screens',
    subtitle: 'Popular screens commonly used by investors.',
    items: [
      {
        title: 'FII Buying',
        description: 'FII buying.',
        prompt: 'Find FII buying stocks',
        tags: ['fii'],
      },
      {
        title: 'The Bull Cartel',
        description: 'Companies with a good quarterly growth.',
        prompt: 'Find strong latest quarterly growers',
        tags: ['quarterly'],
      },
      {
        title: 'Low on 10 year average earnings',
        description: 'Graham-style long average earnings value screen.',
        prompt: 'Find low on 10 year average earnings stocks',
        tags: ['value'],
      },
      {
        title: 'Magic Formula',
        description: 'Based on famous Magic Formula.',
        prompt: 'Find Magic Formula stocks',
        tags: ['formula'],
      },
      {
        title: 'Growth Stocks',
        description: 'High growth at reasonable price.',
        prompt: 'Find growth stocks at reasonable price',
        tags: ['growth'],
      },
      {
        title: 'Highest Dividend Yield Shares',
        description: 'Dividend stocks sorted by highest yield.',
        prompt: 'Find highest dividend yield shares',
        tags: ['dividend'],
      },
      {
        title: 'Companies creating new high',
        description: 'Companies with current price around 52 week high.',
        prompt: 'Find companies creating new high',
        tags: ['new high'],
      },
      {
        title: 'Golden Crossover',
        description: '50 DMA above 200 DMA from below.',
        prompt: 'Find golden crossover stocks',
        tags: ['crossover'],
      },
      {
        title: 'Capacity expansion',
        description: 'Companies undergoing major capacity expansion.',
        prompt: 'Find capacity expansion companies',
        tags: ['capex'],
      },
    ],
  },
];

const SECTORS = [
  'Aerospace & Defense',
  'Agricultural Food & other Products',
  'Agricultural, Commercial & Construction Vehicles',
  'Auto Components',
  'Automobiles',
  'Banks',
  'Beverages',
  'Capital Markets',
  'Cement & Cement Products',
  'Chemicals & Petrochemicals',
  'Cigarettes & Tobacco Products',
  'Commercial Services & Supplies',
  'Construction',
  'Consumable Fuels',
  'Consumer Durables',
  'Diversified',
  'Diversified FMCG',
  'Diversified Metals',
  'Electrical Equipment',
  'Engineering Services',
  'Entertainment',
  'Ferrous Metals',
  'Fertilizers & Agrochemicals',
  'Finance',
  'Financial Technology (Fintech)',
  'Food Products',
  'Gas',
  'Healthcare Equipment & Supplies',
  'Healthcare Services',
  'Household Products',
  'Industrial Manufacturing',
  'Industrial Products',
  'Insurance',
  'IT - Hardware',
  'IT - Services',
  'IT - Software',
  'Leisure Services',
  'Media',
  'Metals & Minerals Trading',
  'Minerals & Mining',
  'Non - Ferrous Metals',
  'Oil',
  'Other Construction Materials',
  'Other Consumer Services',
  'Other Utilities',
  'Paper, Forest & Jute Products',
  'Personal Products',
  'Petroleum Products',
  'Pharmaceuticals & Biotechnology',
  'Power',
  'Printing & Publication',
  'Realty',
  'Retailing',
  'Telecom - Equipment & Accessories',
  'Telecom - Services',
];

const CATEGORY_HINTS: Array<[string, string[]]> = [
  ['Banks', ['bank', 'sbi', 'hdfc', 'icici', 'axis', 'kotak', 'indusind', 'federal', 'canara', 'pnb']],
  ['Finance', ['finance', 'finserv', 'financiers', 'credit', 'capital', 'housing', 'muthoot', 'bajaj']],
  ['Capital Markets', ['bse', 'mcx', 'cdsl', 'cams', 'angel', 'amc', 'securities']],
  ['IT - Software', ['tcs', 'infosys', 'wipro', 'hcl', 'tech', 'software', 'systems', 'mindtree', 'coforge', 'persistent']],
  ['Automobiles', ['motors', 'auto', 'maruti', 'mahindra', 'eicher', 'tvs', 'ashok', 'tesla', 'rivian']],
  ['Auto Components', ['bosch', 'motherson', 'tyre', 'mrf', 'balkrishna']],
  ['Pharmaceuticals & Biotechnology', ['pharma', 'dr.', 'cipla', 'lupin', 'biocon', 'zydus', 'glenmark', 'pfizer', 'merck']],
  ['Healthcare Services', ['hospital', 'health', 'apollo', 'max healthcare', 'cvs']],
  ['Oil', ['oil', 'ongc', 'exxon', 'chevron']],
  ['Petroleum Products', ['reliance', 'bpcl', 'hpcl', 'ioc', 'valero', 'marathon']],
  ['Gas', ['gas', 'gail']],
  ['Power', ['power', 'ntpc', 'grid', 'energy', 'nextera', 'duke']],
  ['Metals & Minerals Trading', ['steel', 'metal', 'hindalco', 'vedanta', 'nmdc', 'sail', 'zinc', 'nucor', 'freeport']],
  ['Cement & Cement Products', ['cement', 'ultratech', 'ambuja', 'shree', 'acc', 'ramco']],
  ['Chemicals & Petrochemicals', ['chemical', 'industries', 'srf', 'pidilite', 'upl', 'linde', 'dow', 'dupont']],
  ['Aerospace & Defense', ['hal', 'bel', 'mazagon', 'cochin', 'dynamics', 'boeing', 'lockheed', 'rtx', 'northrop']],
  ['Realty', ['realty', 'properties', 'dlf', 'lodha', 'oberoi', 'prestige', 'sobha', 'reit']],
  ['Retailing', ['retail', 'trent', 'dmart', 'walmart', 'target', 'costco']],
  ['Telecom - Services', ['telecom', 'communications', 'vodafone', 'idea', 'verizon', 't-mobile', 'at&t']],
  ['Food Products', ['food', 'britannia', 'nestle', 'tata consumer', 'pepsico', 'mondelez']],
  ['Beverages', ['beverages', 'united breweries', 'spirits', 'starbucks']],
  ['Diversified FMCG', ['itc', 'hul', 'hindustan unilever', 'dabur', 'marico', 'colgate']],
  ['Media', ['media', 'disney', 'comcast', 'warner', 'fox']],
  ['Insurance', ['insurance', 'lombard', 'star health', 'progressive', 'chubb']],
  ['Construction', ['construction', 'larsen', 'lt', 'brigade']],
];

const EXAMPLE_PROMPTS = [
  'Find banks near 52 week high with good volume',
  'Backtest TCS: buy Friday close and sell Monday open',
  'What was Reliance closing price on 12 Feb 2025?',
  'Show oversold RSI below 30 stocks in India',
];

function getStockSector(stock: Stock) {
  const haystack = `${stock.name} ${stock.symbol}`.toLowerCase();
  return CATEGORY_HINTS.find(([, words]) => words.some(word => haystack.includes(word)))?.[0] ?? 'Diversified';
}

function parseRequestedDate(prompt: string) {
  const monthMap: Record<string, string> = {
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
  const lower = prompt.toLowerCase();
  const named = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/);
  if (named && monthMap[named[2]]) {
    return `${named[3] ?? new Date().getFullYear()}-${monthMap[named[2]]}-${named[1].padStart(2, '0')}`;
  }
  const iso = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const slash = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  if (!slash) return null;
  return `${slash[3] ?? new Date().getFullYear()}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
}

function resolveStock(prompt: string) {
  const lower = prompt.toLowerCase();
  return STOCKS.find(stock => {
    const symbol = stock.symbol.toLowerCase();
    const ticker = stock.ticker.toLowerCase();
    const name = stock.name.toLowerCase();
    return new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)
      || lower.includes(ticker)
      || lower.includes(name);
  }) ?? STOCKS.find(stock => stock.exchange === 'NSE') ?? STOCKS[0];
}

function getScreenConditions(prompt: string) {
  const lower = prompt.toLowerCase();
  const conditions: string[] = [];
  const notes: string[] = [];

  if (/\bindia|nse|bse\b/.test(lower)) conditions.push("market = 'INDIA'");
  if (/\bus|nasdaq|nyse\b/.test(lower)) conditions.push("market = 'US'");
  if (lower.includes('bank')) conditions.push("sector = 'Banks'");
  if (lower.includes('pharma') || lower.includes('health')) conditions.push("sector IN ('Pharmaceuticals & Biotechnology', 'Healthcare Services')");
  if (lower.includes('it ') || lower.includes('software') || lower.includes('tech')) conditions.push("sector LIKE 'IT%'");
  if (lower.includes('auto')) conditions.push("sector IN ('Automobiles', 'Auto Components')");
  if (lower.includes('defence') || lower.includes('defense') || lower.includes('aerospace')) conditions.push("sector = 'Aerospace & Defense'");
  if (lower.includes('power') || lower.includes('energy')) conditions.push("sector IN ('Power', 'Oil', 'Petroleum Products')");
  if (lower.includes('52 week') || lower.includes('new high')) {
    conditions.push('close >= 0.90 * high_52_week');
    notes.push('Needs live 52 week high data for exact ranking.');
  }
  if (lower.includes('rsi') || lower.includes('oversold')) {
    conditions.push('rsi_14 < 30');
    notes.push('Technical filters are translated and can be run by the strategy engine per stock.');
  }
  if (lower.includes('golden')) conditions.push('sma_50 > sma_200 AND previous_sma_50 <= previous_sma_200');
  if (lower.includes('bearish')) conditions.push('sma_50 < sma_200 AND previous_sma_50 >= previous_sma_200');
  if (lower.includes('volume')) conditions.push('volume > 5 * avg_volume_20d');
  if (lower.includes('dividend')) conditions.push('dividend_yield IS NOT NULL ORDER BY dividend_yield DESC');
  if (lower.includes('growth')) conditions.push('sales_growth_3y > 10');
  if (lower.includes('debt')) conditions.push('debt_to_equity < previous_debt_to_equity');
  if (lower.includes('capacity') || lower.includes('capex')) conditions.push('fixed_assets_3y_growth > 100 OR cwip_1y_growth > 50');
  if (lower.includes('magic formula')) conditions.push('earnings_yield DESC, return_on_capital DESC');
  if (lower.includes('piotroski')) conditions.push('piotroski_score = 9');
  if (lower.includes('coffee can')) conditions.push('roce_10y_avg > 15 AND sales_growth_10y > 10');

  return { conditions, notes };
}

function buildFilterPrompt(prompt: string) {
  const { conditions, notes } = getScreenConditions(prompt);
  const where = conditions.length
    ? conditions.filter(condition => !condition.startsWith('dividend_yield') && !condition.includes(' DESC')).join('\n  AND ')
    : "name ILIKE '%query%' OR symbol ILIKE '%query%'";
  const ordering = conditions.find(condition => condition.includes(' DESC'));
  const sql = [
    'SELECT symbol, name, exchange, sector, close, market_cap',
    'FROM stocks',
    `WHERE ${where}`,
    ordering ? `ORDER BY ${ordering}` : 'ORDER BY market_cap DESC',
    'LIMIT 50;',
  ].join('\n');
  const python = [
    'screen = stocks.copy()',
    ...conditions.map(condition => `# ${condition}`),
    'screen = apply_live_indicators(screen)',
    'result = screen.head(50)',
  ].join('\n');
  return { sql, python, notes };
}

function filterLocalStocks(prompt: string, selectedSector?: string) {
  const lower = prompt.toLowerCase();
  const hasUsIntent = /\bus|nasdaq|nyse\b/.test(lower);
  const hasIndiaIntent = /\bindia|nse|bse\b/.test(lower) || !hasUsIntent;
  const sectorHint = selectedSector || SECTORS.find(sector => lower.includes(sector.toLowerCase().split(' - ')[0].split(' & ')[0]));
  const keywordTokens = lower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !['find', 'show', 'stocks', 'stock', 'with', 'and', 'the', 'near', 'good'].includes(token));

  return STOCKS
    .filter(stock => {
      if (hasIndiaIntent && !hasUsIntent && !['NSE', 'BSE'].includes(stock.exchange)) return false;
      if (hasUsIntent && !['NASDAQ', 'NYSE'].includes(stock.exchange)) return false;
      if (sectorHint && getStockSector(stock) !== sectorHint) return false;
      if (keywordTokens.length === 0) return true;
      const haystack = `${stock.name} ${stock.symbol} ${stock.exchange} ${getStockSector(stock)}`.toLowerCase();
      return keywordTokens.some(token => haystack.includes(token));
    })
    .slice(0, 36);
}

function nearestCandles(chartData: ChartRow[], requestedDate: string) {
  const candles = chartData
    .filter(row => row.date && row.open && row.high && row.low && row.close)
    .map(row => ({ ...row, day: row.date!.toString().slice(0, 10) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return {
    exact: candles.find(row => row.day === requestedDate),
    previous: [...candles].reverse().find((row: ChartCandle) => row.day < requestedDate),
    next: candles.find(row => row.day > requestedDate),
  };
}

function formatPrice(value: unknown, currency: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${currency}${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function ScreensPage() {
  const [aiPrompt, setAiPrompt] = useState('');
  const [selectedSector, setSelectedSector] = useState<string | undefined>();
  const [result, setResult] = useState<AiResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [visibleSections, setVisibleSections] = useState(5);

  const popularItems = useMemo(() => SCREEN_SECTIONS.flatMap(section => section.items).slice(0, 12), []);

  const runAiSearch = async (nextPrompt = aiPrompt, sector = selectedSector) => {
    const prompt = nextPrompt.trim();
    if (!prompt) return;
    setAiPrompt(prompt);
    setIsRunning(true);
    setResult(null);

    try {
      const stock = resolveStock(prompt);
      const requestedDate = parseRequestedDate(prompt);
      const wantsPrice = /\b(price|open|opening|close|closing|ohlc|high|low)\b/i.test(prompt) && requestedDate;
      const wantsBacktest = /\b(backtest|strategy|buy|sell|friday|monday|rsi|macd|crossover|darvas)\b/i.test(prompt)
        && !/\bfind|show|screen|filter\b/i.test(prompt);

      if (wantsPrice && requestedDate) {
        const response = await fetch(`${BACKEND}/api/v1/chart/${encodeURIComponent(stock.ticker)}?range=max`);
        const chartData = await response.json() as ChartRow[] | { detail?: string };
        if (!response.ok || !Array.isArray(chartData)) {
          throw new Error(Array.isArray(chartData) ? 'Price history unavailable.' : chartData?.detail || 'Price history unavailable.');
        }
        const candles = nearestCandles(chartData, requestedDate);
        const candle = candles.exact;
        setResult({
          mode: 'price',
          ticker: stock.ticker,
          title: candle ? `${stock.symbol} price on ${requestedDate}` : `${stock.symbol} was not traded on ${requestedDate}`,
          summary: candle
            ? `Found the loaded OHLC candle for ${stock.name}.`
            : 'That date may be a weekend, holiday, or outside available history. Nearest trading days are shown.',
          priceRows: candle
            ? [
                ['Open', formatPrice(candle.open, stock.currency)],
                ['High', formatPrice(candle.high, stock.currency)],
                ['Low', formatPrice(candle.low, stock.currency)],
                ['Close', formatPrice(candle.close, stock.currency)],
              ]
            : [
                ['Previous trading day', candles.previous ? `${candles.previous.day} close ${formatPrice(candles.previous.close, stock.currency)}` : 'Not available'],
                ['Next trading day', candles.next ? `${candles.next.day} close ${formatPrice(candles.next.close, stock.currency)}` : 'Not available'],
              ],
        });
        return;
      }

      if (wantsBacktest) {
        const response = await fetch(`${BACKEND}/api/v1/backtest/custom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: stock.ticker, prompt }),
        });
        const data = await response.json() as BacktestResponse;
        if (!response.ok || data?.custom_metrics?.error) throw new Error(data?.detail || data?.custom_metrics?.error || 'Backtest failed.');
        setResult({
          mode: 'backtest',
          ticker: stock.ticker,
          title: `${stock.symbol} strategy test`,
          summary: data.custom_metrics?.analysis_text || data.custom_metrics?.warning || 'Strategy backtest completed.',
          backtest: data,
        });
        return;
      }

      const generated = buildFilterPrompt(prompt);
      const rows = filterLocalStocks(prompt, sector);
      setResult({
        mode: 'screen',
        title: rows.length ? `Found ${rows.length} matching stocks` : 'No local matches yet',
        summary: generated.notes.length
          ? `Translated your request into a live-data screen. ${generated.notes.join(' ')}`
          : 'Translated your request into a stock screen and matched it against the loaded stock universe.',
        sql: generated.sql,
        python: generated.python,
        rows,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try a simpler stock, date, or strategy prompt.';
      setResult({
        mode: 'answer',
        title: 'AI search could not finish',
        summary: '',
        error: message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const runScreen = (item: ScreenItem) => {
    setSelectedSector(undefined);
    runAiSearch(item.prompt, undefined);
  };

  const runSector = (sector: string) => {
    setSelectedSector(sector);
    runAiSearch(`Show ${sector} stocks in India`, sector);
  };

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 font-black text-cyan-700">
              BE
            </div>
            <div>
              <div className="font-['Space_Grotesk'] text-xl font-black uppercase tracking-[0.16em]">
                BULLS<span className="text-cyan-500">EYE</span>
              </div>
              <div className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:block">
                Stock screens
              </div>
            </div>
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
          >
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="font-['Space_Grotesk'] text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  Stock screens
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Browse ready-made screens or ask the AI bar to create one from plain English, SQL-style logic, or a strategy idea.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAiPrompt('Find profitable companies with low debt and strong quarterly growth');
                  runAiSearch('Find profitable companies with low debt and strong quarterly growth', selectedSector);
                }}
                className="rounded-lg bg-[#6257ff] px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-[#4f46e5]"
              >
                Create new screen
              </button>
            </div>

            <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-3">
              <div className="flex flex-col gap-3 lg:flex-row">
                <input
                  value={aiPrompt}
                  onChange={event => setAiPrompt(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !isRunning && aiPrompt.trim()) runAiSearch();
                  }}
                  placeholder="AI search: filter stocks, ask price on a date, or backtest a strategy"
                  className="min-h-12 flex-1 rounded-lg border border-cyan-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
                <button
                  type="button"
                  onClick={() => runAiSearch()}
                  disabled={isRunning || !aiPrompt.trim()}
                  className="rounded-lg bg-slate-950 px-6 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {isRunning ? 'Thinking...' : 'Ask AI'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => runAiSearch(prompt, selectedSector)}
                    className="rounded-md border border-cyan-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {result && (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-cyan-600">AI result</div>
                  <h2 className="mt-1 font-['Space_Grotesk'] text-xl font-black">{result.title}</h2>
                  {result.error ? (
                    <p className="mt-2 text-sm text-red-600">{result.error}</p>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{result.summary}</p>
                  )}
                </div>
                {result.ticker && (
                  <Link
                    href={`/?ticker=${encodeURIComponent(result.ticker)}`}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
                  >
                    Open chart
                  </Link>
                )}
              </div>

              {result.priceRows && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {result.priceRows.map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                      <div className="mt-2 font-['JetBrains_Mono'] text-lg font-black text-slate-950">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {result.backtest && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    ['Trades', result.backtest.custom_metrics?.total_trades ?? 0],
                    ['Win rate', `${result.backtest.custom_metrics?.win_rate ?? 0}%`],
                    ['Avg return', `${result.backtest.custom_metrics?.avg_return_per_trade_pct ?? 0}%`],
                    ['Total return', `${result.backtest.custom_metrics?.total_return_pct ?? 0}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                      <div className="mt-2 font-['JetBrains_Mono'] text-lg font-black text-slate-950">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {result.sql && (
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-cyan-300">Generated SQL</div>
                    <pre className="overflow-x-auto text-xs leading-relaxed"><code>{result.sql}</code></pre>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-cyan-300">Generated Python plan</div>
                    <pre className="overflow-x-auto text-xs leading-relaxed"><code>{result.python}</code></pre>
                  </div>
                </div>
              )}

              {result.rows && (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[1.3fr_0.8fr_1fr_0.6fr] bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>Company</span>
                    <span>Symbol</span>
                    <span>Sector</span>
                    <span>Market</span>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto">
                    {result.rows.length > 0 ? result.rows.map(stock => (
                      <Link
                        key={stock.ticker}
                        href={`/?ticker=${encodeURIComponent(stock.ticker)}`}
                        className="grid grid-cols-[1.3fr_0.8fr_1fr_0.6fr] items-center border-t border-slate-100 px-4 py-3 text-sm transition hover:bg-cyan-50/60"
                      >
                        <span className="min-w-0 truncate font-bold text-slate-900">{stock.name}</span>
                        <span className="font-['JetBrains_Mono'] text-xs text-cyan-700">{stock.symbol}</span>
                        <span className="min-w-0 truncate text-xs text-slate-500">{getStockSector(stock)}</span>
                        <span className="text-xs font-bold text-slate-500">{stock.exchange}</span>
                      </Link>
                    )) : (
                      <div className="px-4 py-8 text-sm text-slate-500">
                        Try broadening the sector or removing strict keywords.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {SCREEN_SECTIONS.slice(0, visibleSections).map(section => (
            <section key={section.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="font-['Space_Grotesk'] text-lg font-black">{section.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{section.subtitle}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {section.items.map(item => (
                  <button
                    key={`${section.title}-${item.title}`}
                    type="button"
                    onClick={() => runScreen(item)}
                    className="group min-h-[64px] rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-['Space_Grotesk'] text-sm font-bold text-slate-950">{item.title}</span>
                      <span className="text-cyan-500 transition group-hover:translate-x-0.5">›</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.description}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {visibleSections < SCREEN_SECTIONS.length && (
            <button
              type="button"
              onClick={() => setVisibleSections(SCREEN_SECTIONS.length)}
              className="self-end rounded-lg border border-[#6257ff] bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-[#6257ff] transition hover:bg-[#6257ff] hover:text-white"
            >
              Show all screens
            </button>
          )}
        </div>

        <aside className="lg:sticky lg:top-[84px] lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-['Space_Grotesk'] text-lg font-black">Browse sectors</h2>
            <div className="mt-3 flex max-h-[74vh] flex-wrap gap-2 overflow-y-auto pr-1">
              {SECTORS.map(sector => (
                <button
                  key={sector}
                  type="button"
                  onClick={() => runSector(sector)}
                  className={`rounded-md border px-3 py-2 text-xs transition ${
                    selectedSector === sector
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700'
                  }`}
                >
                  {sector}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-['Space_Grotesk'] text-lg font-black">Quick screens</h2>
            <div className="mt-3 flex flex-col gap-2">
              {popularItems.map(item => (
                <button
                  key={`quick-${item.title}`}
                  type="button"
                  onClick={() => runScreen(item)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 transition hover:border-cyan-300 hover:bg-cyan-50/40 hover:text-cyan-700"
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
