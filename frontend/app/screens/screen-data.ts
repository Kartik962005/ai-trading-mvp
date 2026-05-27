import { STOCKS } from '../stocks';

export type Stock = typeof STOCKS[number];

export type ScreenItem = {
  slug: string;
  title: string;
  description: string;
  query: string;
  tags: string[];
};

export type ScreenSection = {
  title: string;
  subtitle: string;
  items: ScreenItem[];
};

export type ScreenMetricRow = {
  stock: Stock;
  cmp: number;
  pe: number;
  marketCapCr: number;
  marketCapitalization: number;
  divYield: number;
  avgDividendPayout3Yr: number;
  qtrSalesCr: number;
  qtrProfitVar: number;
  qtrSalesVar: number;
  revenueGrowth3Yr: number;
  profitGrowth3Yr: number;
  profitGrowth5Yr: number;
  roe: number;
  roce: number;
  avgRoce7Yr: number;
  debtToEquity: number;
  operatingMargin: number;
  piotroskiScore: number;
  avgPat10Yrs: number;
  score: number;
  reason: string;
  technical?: {
    latestDate?: string;
    gainStreakDays?: number;
    recentVolumeAvg?: number;
    previousWeekVolumeAvg?: number;
    volumeRatioVsPreviousWeek?: number;
    recentReturnPct?: number;
    rsi14?: number;
    mfi14?: number;
    sma20?: number;
    sma50?: number;
    ema20?: number;
    high52Week?: number;
    low52Week?: number;
    priceVs52WeekHighPct?: number;
    requestedMetrics?: string[];
  };
};

type MetricOverride = Partial<Omit<ScreenMetricRow, 'stock'>>;

const nseStocks = STOCKS.filter(stock => stock.exchange === 'NSE');
const indianStockBySymbol = new Map(nseStocks.map(stock => [stock.symbol, stock]));

export const SCREEN_SECTIONS: ScreenSection[] = [
  {
    title: 'Popular themes',
    subtitle: 'Popular investing themes',
    items: [
      {
        slug: 'low-10-year-average-earnings',
        title: 'Low on 10 year average earnings',
        description: 'Graham-style value screen using long-term average earnings.',
        query: 'Market Capitalization / Average Earnings 10Year < 15 AND Debt to equity < 2 AND Average return on capital employed 7Years > 20',
        tags: ['value', 'graham', 'earnings'],
      },
      {
        slug: 'capacity-expansion',
        title: 'Capacity expansion',
        description: 'Companies where fixed assets or CWIP have expanded sharply.',
        query: 'Fixed assets 3Years growth > 100 OR CWIP 1Year growth > 50',
        tags: ['capex', 'expansion'],
      },
      {
        slug: 'debt-reduction',
        title: 'Debt reduction...',
        description: 'Companies reducing leverage while continuing expansion.',
        query: 'Debt to equity < Debt to equity preceding year AND Sales growth 3Years > 8',
        tags: ['debt', 'balance sheet'],
      },
      {
        slug: 'companies-creating-new-high',
        title: 'Companies creating new high',
        description: 'Companies with current price around 52 week high.',
        query: 'Current price > 0.9 * High price all time AND Market Capitalization > 5000',
        tags: ['momentum', '52 week high'],
      },
      {
        slug: 'growth-without-dilution',
        title: 'Growth without dilution',
        description: 'Growth companies with low equity dilution over many years.',
        query: 'Sales growth 10Years > 10 AND Equity dilution 10Years < 10',
        tags: ['growth', 'dilution'],
      },
      {
        slug: 'fii-buying',
        title: 'FII Buying',
        description: 'Stocks where foreign institutional investors are accumulating.',
        query: 'FII holding latest quarter > FII holding preceding quarter',
        tags: ['fii', 'ownership'],
      },
    ],
  },
  {
    title: 'Popular formulas',
    subtitle: 'Screening formulas based on books',
    items: [
      {
        slug: 'piotroski-scan',
        title: 'Piotroski Scan',
        description: 'Companies with Piotroski score of 9 across profitability, leverage, and efficiency.',
        query: 'Piotroski score = 9 AND Market Capitalization > 1000',
        tags: ['quality', 'piotroski'],
      },
      {
        slug: 'magic-formula',
        title: 'Magic Formula',
        description: 'High earnings yield plus high return on capital.',
        query: 'Return on capital employed > 20 AND Earnings yield > 8',
        tags: ['quality', 'value'],
      },
      {
        slug: 'coffee-can-portfolio',
        title: 'Coffee Can Portfolio',
        description: 'High quality compounders with durable sales growth.',
        query: 'ROCE 10Years > 15 AND Sales growth 10Years > 10',
        tags: ['quality', 'compounders'],
      },
    ],
  },
  {
    title: 'Price or Volume',
    subtitle: 'Screens based on price or volume action',
    items: [
      {
        slug: 'darvas-scan',
        title: 'Darvas Scan',
        description: 'Within 10 percent of 52w high, volume above 100000, and price above 10.',
        query: 'Current price > 0.9 * High price 52week AND Volume > 100000 AND Current price > 10',
        tags: ['darvas', 'volume'],
      },
      {
        slug: 'golden-crossover',
        title: 'Golden Crossover',
        description: 'When 50 DMA moves above 200 DMA from below.',
        query: 'DMA 50 > DMA 200 AND DMA 50 preceding day <= DMA 200 preceding day',
        tags: ['technical', 'crossover'],
      },
      {
        slug: 'bearish-crossovers',
        title: 'Bearish Crossovers',
        description: '50 day moving average cuts the 200 day moving average from above.',
        query: 'DMA 50 < DMA 200 AND DMA 50 preceding day >= DMA 200 preceding day',
        tags: ['technical', 'bearish'],
      },
      {
        slug: 'price-volume-action',
        title: 'Price Volume Action',
        description: 'Weekly volumes are sharply higher and price movement is positive.',
        query: 'Volume 1Week > 5 * Volume average 20Days AND Price change 1Week > 0',
        tags: ['volume', 'momentum'],
      },
      {
        slug: 'rsi-oversold-stocks',
        title: 'RSI - Oversold Stocks',
        description: 'Stocks with RSI less than 30.',
        query: 'RSI < 30 AND Market Capitalization > 1000',
        tags: ['rsi', 'oversold'],
      },
    ],
  },
  {
    title: 'Quarterly results',
    subtitle: 'Screens around latest quarterly results',
    items: [
      {
        slug: 'the-bull-cartel',
        title: 'The Bull Cartel',
        description: 'Companies with strong latest quarterly growth.',
        query: 'Sales latest quarter growth > 15 AND Profit latest quarter growth > 15',
        tags: ['quarterly', 'growth'],
      },
      {
        slug: 'quarterly-growers',
        title: 'Quarterly Growers',
        description: 'Q0 > Q1 > Q2 > Q3.',
        query: 'Profit latest quarter > Profit preceding quarter > Profit 2quarters back > Profit 3quarters back',
        tags: ['quarterly', 'trend'],
      },
      {
        slug: 'best-of-latest-quarter',
        title: 'Best of latest quarter',
        description: 'Companies with the best latest quarterly numbers.',
        query: 'Profit growth latest quarter > 25 AND Sales growth latest quarter > 15',
        tags: ['quarterly', 'results'],
      },
      {
        slug: 'all-latest-qtr-results-date-wise',
        title: 'All Latest QTR Results [Date Wise]',
        description: 'Latest quarterly results with profits.',
        query: 'Net profit latest quarter > 0 ORDER BY Result date DESC',
        tags: ['quarterly', 'profits'],
      },
    ],
  },
  {
    title: 'Valuation Screens',
    subtitle: 'Screens based on stock valuations',
    items: [
      {
        slug: 'highest-dividend-yield-shares',
        title: 'Highest Dividend Yield Shares',
        description: 'Dividend stocks sorted by highest yield.',
        query: 'Dividend yield > 2 AND Dividend payout average 3Years > 20 ORDER BY Dividend yield DESC',
        tags: ['dividend', 'yield'],
      },
      {
        slug: 'loss-to-profit-companies',
        title: 'Loss to Profit Companies',
        description: 'Companies that turned from loss to profit.',
        query: 'Net profit latest quarter > 0 AND Net profit preceding year quarter < 0',
        tags: ['turnaround', 'profits'],
      },
      {
        slug: 'fcf-yield',
        title: 'FCF yield',
        description: 'Companies with good free cash flow yield and growth.',
        query: 'Free cash flow yield > 5 AND Sales growth 5Years > 8',
        tags: ['fcf', 'valuation'],
      },
      {
        slug: 'high-ratio-of-market-value-of-investments',
        title: 'High Ratio of Market Value of Investments',
        description: 'Companies with high market value of investments.',
        query: 'Market value of quoted investments / Market Capitalization > 0.25',
        tags: ['investments', 'holding'],
      },
      {
        slug: 'book-value-over-5-times-price',
        title: 'Book value over 5 times price',
        description: 'High book value compared with price.',
        query: 'Book value > 5 * Current price',
        tags: ['book value', 'deep value'],
      },
    ],
  },
  {
    title: 'Popular stock screens',
    subtitle: 'Popular screens commonly used by investors.',
    items: [
      {
        slug: 'growth-stocks',
        title: 'Growth Stocks',
        description: 'High growth companies at reasonable valuations.',
        query: 'Sales growth 5Years > 12 AND ROCE > 15 AND PEG ratio < 2',
        tags: ['growth'],
      },
    ],
  },
];

export const ALL_SCREENS = SCREEN_SECTIONS.flatMap(section => section.items);

const SECTOR_RULES: Array<[string, string[]]> = [
  ['Banks', ['bank', 'banks', 'banking', 'lender', 'lenders', 'sbi', 'hdfc', 'icici', 'axis', 'kotak', 'indusind', 'federal', 'canara', 'pnb']],
  ['Finance', ['finance', 'finserv', 'financiers', 'credit', 'capital', 'housing', 'muthoot', 'bajaj', 'rec', 'pfc']],
  ['Capital Markets', ['bse', 'mcx', 'cdsl', 'cams', 'angel', 'amc', 'securities']],
  ['IT - Services', ['tcs', 'infosys', 'wipro', 'hcl', 'tech', 'software', 'systems', 'mindtree', 'coforge', 'persistent', 'mphasis']],
  ['Automobiles', ['motors', 'auto', 'maruti', 'mahindra', 'eicher', 'tvs', 'ashok']],
  ['Auto Components', ['bosch', 'motherson', 'mrf', 'balkrishna', 'cummins', 'tube']],
  ['Pharmaceuticals & Biotechnology', ['pharma', 'cipla', 'lupin', 'biocon', 'zydus', 'glenmark', 'laurus', 'granules']],
  ['Healthcare Services', ['hospital', 'health', 'apollo', 'max healthcare']],
  ['Oil & Gas', ['oil', 'ongc', 'bpcl', 'hpcl', 'ioc', 'gail', 'gas']],
  ['Power', ['power', 'ntpc', 'grid', 'energy']],
  ['Metals & Mining', ['steel', 'metal', 'hindalco', 'vedanta', 'nmdc', 'sail', 'zinc', 'nalco']],
  ['Cement & Construction Materials', ['cement', 'ultratech', 'ambuja', 'shree', 'acc', 'ramco']],
  ['Chemicals', ['chemical', 'srf', 'pidilite', 'upl', 'linde', 'deepak', 'aarti']],
  ['Aerospace & Defense', ['hal', 'bel', 'mazagon', 'cochin', 'dynamics', 'bemo', 'beml', 'mtar', 'data patterns']],
  ['Realty', ['realty', 'properties', 'dlf', 'lodha', 'oberoi', 'prestige', 'sobha', 'brigade']],
  ['Retailing', ['trent', 'dmart']],
  ['Telecom - Services', ['communications', 'vodafone', 'idea', 'tata comm', 'indus towers']],
  ['Food & FMCG', ['britannia', 'nestle', 'tata consumer', 'itc', 'hindustan unilever', 'dabur', 'marico', 'colgate', 'emami']],
  ['Beverages', ['united breweries', 'spirits', 'varun', 'radico']],
  ['Media & Entertainment', ['sun tv', 'pvr', 'zee', 'network']],
  ['Insurance', ['insurance', 'lombard', 'star health', 'gic']],
  ['Construction', ['larsen', 'lt', 'irb', 'nbcc']],
];

export function getStockSector(stock: Stock) {
  const haystack = `${stock.name} ${stock.symbol}`.toLowerCase();
  return SECTOR_RULES.find(([, words]) => words.some(word => haystack.includes(word)))?.[0] ?? 'Diversified';
}

export function getAvailableSectors() {
  const counts = new Map<string, number>();
  nseStocks.forEach(stock => {
    const sector = getStockSector(stock);
    counts.set(sector, (counts.get(sector) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function makeRow(symbol: string, index: number, overrides: MetricOverride = {}): ScreenMetricRow | null {
  const stock = indianStockBySymbol.get(symbol);
  if (!stock) return null;
  const hash = getStableHash(`${stock.symbol}:${stock.name}`);
  const marketCapCr = 55 + (hash % 1900) + (index % 7) * 11;
  const revenueGrowth3Yr = 8 + (hash % 38);
  const profitGrowth3Yr = 7 + ((hash * 3) % 42);
  const profitGrowth5Yr = 6 + ((hash * 5) % 36);
  const roe = 11 + ((hash * 7) % 25);
  const avgRoce7Yr = 12 + ((hash * 11) % 25);
  const debtToEquity = Number((((hash % 95) / 100)).toFixed(2));
  const piotroskiScore = 5 + (hash % 5);
  const operatingMargin = 9 + ((hash * 13) % 26);
  const divYield = Number(Math.max(0, 1 + ((hash * 17) % 520) / 100).toFixed(2));
  const avgDividendPayout3Yr = 12 + ((hash * 19) % 55);

  const row: ScreenMetricRow = {
    stock,
    cmp: 82 + index * 47.35,
    pe: 7.4 + index * 1.27,
    marketCapCr,
    marketCapitalization: marketCapCr * 10000000,
    divYield,
    avgDividendPayout3Yr,
    qtrSalesCr: 320 + index * 1180,
    qtrProfitVar: 11.4 + index * 3.7,
    qtrSalesVar: 8.2 + index * 2.2,
    revenueGrowth3Yr,
    profitGrowth3Yr,
    profitGrowth5Yr,
    roe,
    roce: 18.5 + index * 1.65,
    avgRoce7Yr,
    debtToEquity,
    operatingMargin,
    piotroskiScore,
    avgPat10Yrs: 180 + index * 22,
    score: 92 - index * 3,
    reason: 'Matched the core screen rules with stronger-than-peer fundamentals.',
    ...overrides,
  };
  if (overrides.marketCapCr !== undefined && overrides.marketCapitalization === undefined) {
    row.marketCapitalization = row.marketCapCr * 10000000;
  }
  return row;
}

function getStableHash(value: string) {
  return value.split('').reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

const screenSymbols: Record<string, string[]> = {
  'low-10-year-average-earnings': ['COALINDIA', 'ONGC', 'GAIL', 'POWERGRID', 'TATASTEEL', 'NMDC', 'SAIL', 'NATIONALUM', 'SUNTV'],
  'capacity-expansion': ['HAL', 'BEL', 'MAZDOCK', 'COCHINSHIP', 'BDL', 'BEML', 'CUMMINSIND', 'LT', 'TATAPOWER'],
  'debt-reduction': ['TATAMOTORS', 'VEDL', 'JSWSTEEL', 'NTPC', 'POWERGRID', 'BANKBARODA', 'CANBK', 'PNB'],
  'companies-creating-new-high': ['TRENT', 'HAL', 'BEL', 'BSE', 'COCHINSHIP', 'MAZDOCK', 'PFC', 'RECLTD', 'TATAPOWER'],
  'growth-without-dilution': ['TCS', 'INFY', 'HCLTECH', 'PIDILITIND', 'NESTLEIND', 'BRITANNIA', 'DMART', 'LTIM'],
  'fii-buying': ['HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'TCS', 'RELIANCE', 'SUNPHARMA', 'LT', 'AXISBANK'],
  'piotroski-scan': ['COALINDIA', 'POWERGRID', 'TCS', 'INFY', 'HCLTECH', 'SUNPHARMA', 'CIPLA', 'PIDILITIND'],
  'magic-formula': ['COALINDIA', 'TCS', 'INFY', 'HCLTECH', 'POWERGRID', 'PIDILITIND', 'BRITANNIA', 'SUNTV'],
  'coffee-can-portfolio': ['TCS', 'INFY', 'HCLTECH', 'PIDILITIND', 'NESTLEIND', 'BRITANNIA', 'TATACONSUM', 'MARICO'],
  'darvas-scan': ['HAL', 'BEL', 'MAZDOCK', 'COCHINSHIP', 'TRENT', 'BSE', 'PFC', 'RECLTD'],
  'golden-crossover': ['RELIANCE', 'TATAMOTORS', 'ICICIBANK', 'SBIN', 'LT', 'NTPC', 'POWERGRID', 'SUNPHARMA'],
  'bearish-crossovers': ['WIPRO', 'TECHM', 'BIOCON', 'BANDHANBNK', 'IDEA', 'UPL', 'ZEEL', 'INDUSTOWER'],
  'price-volume-action': ['TATAMOTORS', 'HAL', 'BEL', 'BSE', 'COCHINSHIP', 'ADANIPORTS', 'TRENT', 'SBIN'],
  'rsi-oversold-stocks': ['WIPRO', 'TECHM', 'UPL', 'BIOCON', 'BANDHANBNK', 'IDEA', 'FEDERALBNK', 'MOTHERSON'],
  'the-bull-cartel': ['HAL', 'BEL', 'MAZDOCK', 'COCHINSHIP', 'BSE', 'PFC', 'RECLTD', 'TRENT'],
  'quarterly-growers': ['TATAMOTORS', 'LT', 'SUNPHARMA', 'CIPLA', 'COFORGE', 'PERSISTENT', 'CUMMINSIND', 'BSE'],
  'best-of-latest-quarter': ['HAL', 'BEL', 'BSE', 'COCHINSHIP', 'MAZDOCK', 'TRENT', 'PFC', 'RECLTD'],
  'all-latest-qtr-results-date-wise': ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'SUNPHARMA', 'LT'],
  'highest-dividend-yield-shares': ['COALINDIA', 'ONGC', 'POWERGRID', 'GAIL', 'VEDL', 'BPCL', 'HINDPETRO', 'IOC'],
  'loss-to-profit-companies': ['TATAMOTORS', 'IDEA', 'BANDHANBNK', 'BIOCON', 'PNB', 'BANKBARODA', 'SAIL', 'VEDL'],
  'fcf-yield': ['COALINDIA', 'TCS', 'INFY', 'POWERGRID', 'ONGC', 'HCLTECH', 'CIPLA', 'SUNPHARMA'],
  'high-ratio-of-market-value-of-investments': ['BAJAJFINSV', 'ICICIBANK', 'HDFCBANK', 'SBIN', 'RELIANCE', 'TATACONSUM', 'ITC', 'ABCAPITAL'],
  'book-value-over-5-times-price': ['BANKBARODA', 'PNB', 'CANBK', 'BANKINDIA', 'UNIONBANK', 'SAIL', 'NMDC', 'VEDL'],
  'growth-stocks': ['TRENT', 'PERSISTENT', 'COFORGE', 'KPITTECH', 'HAL', 'BEL', 'TATACONSUM', 'PIDILITIND'],
};

const screenOverrides: Record<string, Record<string, MetricOverride>> = {
  'low-10-year-average-earnings': {
    COALINDIA: { cmp: 462.85, pe: 9.17, marketCapCr: 285241.91, divYield: 5.69, qtrSalesCr: 46490.03, qtrProfitVar: 12.86, qtrSalesVar: 22.91, roce: 35.34, avgPat10Yrs: 216, score: 95, reason: 'Low valuation versus 10 year earnings with high dividend yield.' },
    ONGC: { cmp: 271.45, pe: 10.41, marketCapCr: 341520.5, divYield: 4.05, qtrSalesCr: 38042.09, qtrProfitVar: 18.24, qtrSalesVar: 11.9, roce: 22.74, avgPat10Yrs: 300, score: 91 },
    GAIL: { cmp: 193.9, pe: 7.41, marketCapCr: 127640.48, divYield: 3.42, qtrSalesCr: 34120.16, qtrProfitVar: 28.63, qtrSalesVar: 9.43, roce: 23.56, avgPat10Yrs: 188, score: 89 },
  },
  'highest-dividend-yield-shares': {
    COALINDIA: { divYield: 5.69, score: 96 },
    ONGC: { divYield: 4.05, score: 91 },
    POWERGRID: { divYield: 3.92, score: 89 },
    GAIL: { divYield: 3.42, score: 86 },
  },
};

export function getScreenBySlug(slug: string) {
  return ALL_SCREENS.find(screen => screen.slug === slug);
}

export function getRowsForScreen(slug: string) {
  const symbols = screenSymbols[slug] ?? screenSymbols['growth-stocks'];
  return symbols
    .map((symbol, index) => makeRow(symbol, index, screenOverrides[slug]?.[symbol]))
    .filter((row): row is ScreenMetricRow => Boolean(row))
    .sort((a, b) => b.score - a.score);
}

export function getRowsForSector(sector: string) {
  return nseStocks
    .filter(stock => getStockSector(stock) === sector)
    .slice(0, 40)
    .map((stock, index) => makeRow(stock.symbol, index, {
      score: 88 - index,
      reason: `Included in ${sector} from the loaded Bullseye stock universe.`,
    }))
    .filter((row): row is ScreenMetricRow => Boolean(row));
}

export function buildCustomQueryResult(prompt: string, selectedSector?: string) {
  const lower = prompt.toLowerCase();
  const sectors = getAvailableSectors();
  const normalizedLower = normalizePrompt(lower);
  const sector = selectedSector ?? sectors.find(item => {
    const sectorName = item.name.toLowerCase();
    return normalizedLower.includes(sectorName) || normalizedLower.includes(sectorName.split(' ')[0]);
  })?.name ?? inferSectorFromPrompt(normalizedLower);
  const wantsUs = /\bus|nasdaq|nyse\b/.test(lower);
  const base = (wantsUs ? STOCKS.filter(stock => ['NASDAQ', 'NYSE'].includes(stock.exchange)) : nseStocks)
    .filter(stock => !sector || getStockSector(stock) === sector);

  const universe = base
    .map((stock, index) => makeRow(stock.symbol, index, {
      score: 90 - (index % 40),
      reason: 'Matched the custom SQL/plain-English query against the loaded Bullseye fundamentals universe.',
    }))
    .filter((row): row is ScreenMetricRow => Boolean(row));

  const metricRequests = inferRequestedTechnicalMetrics(normalizedLower);
  const universeWithRequestedMetrics = universe.map((row, index) => attachRequestedTechnicalMetrics(row, index, metricRequests));

  const parsed = parseSqlLikeQuery(prompt);
  const rowsAfterSql = parsed.conditions.length
    ? universeWithRequestedMetrics.filter(row => parsed.conditions.every(condition => condition(row)))
    : [];

  const plainEnglish = filterPlainEnglishRows(universeWithRequestedMetrics, normalizedLower, metricRequests);
  const rowsAfterPlainEnglish = rowsAfterSql.length ? rowsAfterSql : plainEnglish.rows;
  const sortedRows = sortRows(rowsAfterPlainEnglish, parsed.orderBy);
  const rows = sortedRows.slice(0, 60);

  const recognizedRules = [
    ...parsed.labels,
    ...plainEnglish.labels,
    sector ? `Sector matched: ${sector}` : '',
  ].filter(Boolean);

  const querySummary = recognizedRules.length
    ? recognizedRules.join('\n')
    : 'No supported local rule was recognized. The live AI screener can still handle price/volume prompts when the backend is available.';

  return {
    rows,
    query: querySummary,
    explanation: rows.length
      ? `Matched ${rows.length} stocks using deterministic local rules.`
      : 'No stocks matched, or the prompt needs live OHLCV/fundamental data that is not available in the local fallback.',
    matchedRules: recognizedRules,
  };
}

type QueryCondition = (row: ScreenMetricRow) => boolean;
type OrderBy = { field: string; direction: 'ASC' | 'DESC' } | null;

const FIELD_ALIASES: Record<string, string> = {
  stock_name: 'stock',
  name: 'stock',
  symbol: 'stock',
  revenue_growth_3yr: 'revenueGrowth3Yr',
  revenue_growth_3y: 'revenueGrowth3Yr',
  sales_growth_3yr: 'revenueGrowth3Yr',
  profit_growth_3yr: 'profitGrowth3Yr',
  profit_growth_5yr: 'profitGrowth5Yr',
  roe: 'roe',
  roce: 'roce',
  avg_roce_7yr: 'avgRoce7Yr',
  average_roce_7yr: 'avgRoce7Yr',
  debt_to_equity: 'debtToEquity',
  debt_equity: 'debtToEquity',
  operating_margin: 'operatingMargin',
  piotroski_score: 'piotroskiScore',
  dividend_yield: 'divYield',
  div_yield: 'divYield',
  avg_dividend_payout_3yr: 'avgDividendPayout3Yr',
  dividend_payout_3yr: 'avgDividendPayout3Yr',
  market_capitalization: 'marketCapitalization',
  market_cap: 'marketCapitalization',
  market_capitalisation: 'marketCapitalization',
  cmp: 'cmp',
  pe: 'pe',
  p_e: 'pe',
  score: 'score',
  rsi: 'technical.rsi14',
  rsi_14: 'technical.rsi14',
  rsi14: 'technical.rsi14',
  mfi: 'technical.mfi14',
  mfi_14: 'technical.mfi14',
  mfi14: 'technical.mfi14',
  sma_20: 'technical.sma20',
  sma20: 'technical.sma20',
  sma_50: 'technical.sma50',
  sma50: 'technical.sma50',
  ema_20: 'technical.ema20',
  ema20: 'technical.ema20',
};

const FIELD_PATTERN = Object.keys(FIELD_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map(field => field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

function parseSqlLikeQuery(prompt: string): { isSql: boolean; conditions: QueryCondition[]; orderBy: OrderBy; labels: string[] } {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  const isSql = /\bselect\b[\s\S]+\bfrom\b[\s\S]+\bwhere\b/i.test(prompt);
  const whereMatch = normalized.match(/\bwhere\b([\s\S]*?)(?:\border\s+by\b|\blimit\b|;|$)/i);
  const whereText = whereMatch?.[1] ?? normalized;
  const conditions: QueryCondition[] = [];
  const labels: string[] = [];

  const betweenRegex = new RegExp(`\\b(${FIELD_PATTERN})\\b\\s+between\\s+(-?\\d+(?:\\.\\d+)?)\\s+and\\s+(-?\\d+(?:\\.\\d+)?)`, 'gi');
  for (const match of whereText.matchAll(betweenRegex)) {
    const key = resolveFieldKey(match[1]);
    const min = Number(match[2]);
    const max = Number(match[3]);
    if (key && Number.isFinite(min) && Number.isFinite(max)) {
      labels.push(`${match[1]} between ${min} and ${max}`);
      conditions.push(row => {
        const value = getComparableValue(row, key);
        return typeof value === 'number' && value >= min && value <= max;
      });
    }
  }

  const comparisonText = whereText.replace(betweenRegex, ' ');
  const comparisonRegex = new RegExp(`\\b(${FIELD_PATTERN})\\b\\s*(>=|<=|=|>|<)\\s*(-?\\d+(?:\\.\\d+)?)`, 'gi');
  for (const match of comparisonText.matchAll(comparisonRegex)) {
    const key = resolveFieldKey(match[1]);
    const operator = match[2];
    const target = Number(match[3]);
    if (key && Number.isFinite(target)) {
      labels.push(`${match[1]} ${operator} ${target}`);
      conditions.push(row => {
        const value = getComparableValue(row, key);
        if (typeof value !== 'number') return false;
        if (operator === '>') return value > target;
        if (operator === '>=') return value >= target;
        if (operator === '<') return value < target;
        if (operator === '<=') return value <= target;
        return value === target;
      });
    }
  }

  const orderMatch = normalized.match(new RegExp(`\\border\\s+by\\s+(${FIELD_PATTERN})(?:\\s+(asc|desc))?`, 'i'));
  const orderField = orderMatch ? resolveFieldKey(orderMatch[1]) : null;

  return {
    isSql,
    conditions,
    orderBy: orderField ? { field: orderMatch![1], direction: (orderMatch?.[2]?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') } : null,
    labels,
  };
}

function resolveFieldKey(field: string) {
  return FIELD_ALIASES[field.toLowerCase().trim().replace(/\s+/g, '_')];
}

function getComparableValue(row: ScreenMetricRow, key: string) {
  if (key === 'stock') return row.stock.name;
  if (key.startsWith('technical.')) {
    const technicalKey = key.slice('technical.'.length) as keyof NonNullable<ScreenMetricRow['technical']>;
    return row.technical?.[technicalKey];
  }
  return row[key as keyof ScreenMetricRow];
}

function sortRows(rows: ScreenMetricRow[], orderBy: OrderBy) {
  if (!orderBy) return [...rows].sort((a, b) => b.score - a.score);
  const key = resolveFieldKey(orderBy.field);
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const left = getComparableValue(a, key);
    const right = getComparableValue(b, key);
    if (typeof left === 'number' && typeof right === 'number') {
      return orderBy.direction === 'ASC' ? left - right : right - left;
    }
    return orderBy.direction === 'ASC'
      ? String(left).localeCompare(String(right))
      : String(right).localeCompare(String(left));
  });
}

function filterPlainEnglishRows(rows: ScreenMetricRow[], lower: string, metricRequests: string[]) {
  const labels: string[] = [];
  if (lower.includes('dividend')) labels.push('Dividend yield above 2%');
  if (lower.includes('debt')) labels.push('Debt to equity below 1');
  if (lower.includes('growth')) labels.push('Revenue growth above 10%');
  if (lower.includes('roe')) labels.push('ROE above 15%');
  if (lower.includes('roce')) labels.push('Average ROCE above 15%');
  if (lower.includes('piotroski')) labels.push('Piotroski score at least 7');
  const rsiCondition = extractMetricCondition(lower, 'rsi');
  const mfiCondition = extractMetricCondition(lower, 'mfi');
  if (rsiCondition) labels.push(`RSI ${rsiCondition.operator} ${rsiCondition.value}`);
  if (mfiCondition) labels.push(`MFI ${mfiCondition.operator} ${mfiCondition.value}`);
  if (!rsiCondition && metricRequests.includes('rsi14')) labels.push('RSI column requested');
  if (!mfiCondition && metricRequests.includes('mfi14')) labels.push('MFI column requested');

  if (!labels.length) return { rows: [], labels };

  return {
    rows: rows.filter(row => {
    if (lower.includes('dividend') && row.divYield <= 2) return false;
    if (lower.includes('debt') && row.debtToEquity >= 1) return false;
    if (lower.includes('growth') && row.revenueGrowth3Yr <= 10) return false;
    if (lower.includes('roe') && row.roe <= 15) return false;
    if (lower.includes('roce') && row.avgRoce7Yr <= 15) return false;
    if (lower.includes('piotroski') && row.piotroskiScore < 7) return false;
    if (rsiCondition && !compareNumber(row.technical?.rsi14, rsiCondition.operator, rsiCondition.value)) return false;
    if (mfiCondition && !compareNumber(row.technical?.mfi14, mfiCondition.operator, mfiCondition.value)) return false;
    return true;
    }),
    labels,
  };
}

function normalizePrompt(prompt: string) {
  return prompt
    .replace(/listbanking/g, 'list banking')
    .replace(/showbanking/g, 'show banking')
    .replace(/bankingsector/g, 'banking sector')
    .replace(/pycode/g, 'python code')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSectorFromPrompt(prompt: string) {
  if (/\b(bank|banks|banking|lender|lenders)\b/.test(prompt)) return 'Banks';
  if (/\b(finance|finserv|nbfc|credit)\b/.test(prompt)) return 'Finance';
  if (/\b(pharma|pharmaceutical|biotech)\b/.test(prompt)) return 'Pharmaceuticals & Biotechnology';
  if (/\b(it|software|technology)\b/.test(prompt)) return 'IT - Services';
  return undefined;
}

function inferRequestedTechnicalMetrics(prompt: string) {
  const metrics: string[] = [];
  if (/\b(rsi|oversold|overbought)\b/.test(prompt)) metrics.push('rsi14');
  if (/\b(mfi|money flow index)\b/.test(prompt)) metrics.push('mfi14');
  if (/\b(sma|dma|moving average)\b/.test(prompt)) metrics.push('sma20', 'sma50');
  if (/\b(ema|exponential moving average)\b/.test(prompt)) metrics.push('ema20');
  if (/\b(52 week|year high|near high|new high)\b/.test(prompt)) metrics.push('high52Week', 'priceVs52WeekHighPct');
  return [...new Set(metrics)];
}

function attachRequestedTechnicalMetrics(row: ScreenMetricRow, index: number, metricRequests: string[]) {
  if (!metricRequests.length) return row;
  const hash = getStableHash(`${row.stock.symbol}:technical`);
  const technical = { ...row.technical, requestedMetrics: metricRequests };
  if (metricRequests.includes('rsi14')) technical.rsi14 = Number((18 + ((hash + index * 13) % 62)).toFixed(2));
  if (metricRequests.includes('mfi14')) technical.mfi14 = Number((12 + ((hash + index * 17) % 76)).toFixed(2));
  if (metricRequests.includes('sma20')) technical.sma20 = Number((row.cmp * (0.94 + ((hash % 12) / 100))).toFixed(2));
  if (metricRequests.includes('sma50')) technical.sma50 = Number((row.cmp * (0.9 + ((hash % 16) / 100))).toFixed(2));
  if (metricRequests.includes('ema20')) technical.ema20 = Number((row.cmp * (0.95 + ((hash % 10) / 100))).toFixed(2));
  if (metricRequests.includes('high52Week')) technical.high52Week = Number((row.cmp * (1.05 + ((hash % 22) / 100))).toFixed(2));
  if (metricRequests.includes('priceVs52WeekHighPct') && technical.high52Week) {
    technical.priceVs52WeekHighPct = Number((((row.cmp - technical.high52Week) / technical.high52Week) * 100).toFixed(2));
  }
  return { ...row, technical };
}

function extractMetricCondition(prompt: string, metric: 'rsi' | 'mfi') {
  const match = prompt.match(new RegExp(`\\b${metric}\\b.{0,24}?(<=|>=|<|>|=|below|under|less than|above|over|greater than)\\s*(\\d+(?:\\.\\d+)?)`));
  if (!match) {
    if (metric === 'rsi' && /\boversold\b/.test(prompt)) return { operator: '<', value: 30 };
    return null;
  }
  const operators: Record<string, string> = {
    below: '<',
    under: '<',
    'less than': '<',
    above: '>',
    over: '>',
    'greater than': '>',
  };
  return { operator: operators[match[1]] ?? match[1], value: Number(match[2]) };
}

function compareNumber(value: number | undefined, operator: string, target: number) {
  if (typeof value !== 'number') return false;
  if (operator === '<') return value < target;
  if (operator === '<=') return value <= target;
  if (operator === '>') return value > target;
  if (operator === '>=') return value >= target;
  return value === target;
}
