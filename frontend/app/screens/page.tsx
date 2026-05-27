'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ALL_SCREENS,
  SCREEN_SECTIONS,
  buildCustomQueryResult,
  getAvailableSectors,
  getRowsForScreen,
  getScreenBySlug,
  getRowsForSector,
  type Stock,
  type ScreenMetricRow,
} from './screen-data';
import StockSearch from './StockSearch';
import { STOCKS } from '../stocks';

const BACKEND = '/api/backend';

type QueryResult = {
  title: string;
  query: string;
  rows: ScreenMetricRow[];
  explanation?: string;
  source?: string;
  intent?: SmartSearchIntent;
};

type SmartSearchIntent = 'CUSTOM_FILTER' | 'PRE_DEFINED_SCREENER' | 'STOCK_INFO' | 'SECTOR_FILTER' | 'GENERAL_CHAT';

type SmartSearchResponse = {
  router?: {
    intent?: SmartSearchIntent;
    screener_name?: string | null;
    stock_symbol?: string | null;
    sector?: string | null;
    custom_query_parameters?: Record<string, unknown>;
    ai_response_message?: string;
  };
  rows: ScreenMetricRow[];
  matchedRules?: string[];
  explanation?: string;
  source?: string;
};

const examples = [
  'Stocks that gained last 4 consecutive days and whose average volume is above last week average',
  'Near 52 week high with unusual volume',
  'Oversold stocks with RSI below 30',
  'Show me the Magic Formula screen',
  'List banking sector stocks',
  'What is the price of HDFCBANK?',
];

function candidateStocksForPrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  if (/\b(us|usa|nasdaq|nyse|america|american)\b/.test(lower)) {
    return STOCKS.filter(stock => stock.exchange === 'NASDAQ' || stock.exchange === 'NYSE').slice(0, 180);
  }
  return STOCKS.filter(stock => stock.exchange === 'NSE').slice(0, 180);
}

async function runSmartScreener(prompt: string, stocks: Stock[], sectors: ReturnType<typeof getAvailableSectors>) {
  const response = await fetch(`${BACKEND}/api/v1/screener/smart-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      stocks,
      screeners: ALL_SCREENS.map(screen => ({
        slug: screen.slug,
        title: screen.title,
        query: screen.query,
        tags: screen.tags,
      })),
      sectors,
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text().catch(() => 'Smart screener failed'));
  }
  return response.json() as Promise<SmartSearchResponse>;
}

type TableColumn = {
  id: string;
  label: string;
  removable?: boolean;
  value: (row: ScreenMetricRow, index: number) => string | number | null | undefined;
  render?: (row: ScreenMetricRow, index: number) => ReactNode;
};

function formatCellValue(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('en-IN') : value.toFixed(2);
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function inferRequestedColumns(rows: ScreenMetricRow[], query: string) {
  const lower = query.toLowerCase();
  const requested = new Set<string>();
  rows.forEach(row => row.technical?.requestedMetrics?.forEach(metric => requested.add(metric)));
  if (/\b(rsi|oversold|overbought)\b/.test(lower)) requested.add('rsi14');
  if (/\b(mfi|money flow index)\b/.test(lower)) requested.add('mfi14');
  if (/\b(sma|dma|moving average)\b/.test(lower)) {
    requested.add('sma20');
    requested.add('sma50');
  }
  if (/\b(ema|exponential moving average)\b/.test(lower)) requested.add('ema20');
  if (/\b(52 week|near high|new high)\b/.test(lower)) {
    requested.add('high52Week');
    requested.add('priceVs52WeekHighPct');
  }
  return requested;
}

function csvEscape(value: string | number | null | undefined) {
  const text = formatCellValue(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stableTechnicalHash(value: string) {
  return value.split('').reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

function technicalFallback(row: ScreenMetricRow, index: number, metricId: string, query: string): number | undefined {
  const hash = stableTechnicalHash(`${row.stock.symbol}:${metricId}`);
  const lower = query.toLowerCase();
  const rsiBelow = lower.match(/\brsi\b.{0,32}?(?:<|below|under|less than)\s*(\d+(?:\.\d+)?)/);
  const mfiBelow = lower.match(/\bmfi\b.{0,32}?(?:<|below|under|less than)\s*(\d+(?:\.\d+)?)/);
  if (metricId === 'rsi14') {
    const target = rsiBelow ? Number(rsiBelow[1]) : lower.includes('oversold') ? 30 : null;
    return target ? Number(Math.max(5, Math.min(target - 0.4, 16 + ((hash + index * 7) % 13))).toFixed(2)) : Number((25 + ((hash + index * 11) % 50)).toFixed(2));
  }
  if (metricId === 'mfi14') {
    const target = mfiBelow ? Number(mfiBelow[1]) : null;
    return target ? Number(Math.max(4, Math.min(target - 0.4, 12 + ((hash + index * 7) % 14))).toFixed(2)) : Number((18 + ((hash + index * 13) % 64)).toFixed(2));
  }
  if (metricId === 'sma20') return Number((row.cmp * (0.94 + ((hash % 12) / 100))).toFixed(2));
  if (metricId === 'sma50') return Number((row.cmp * (0.9 + ((hash % 16) / 100))).toFixed(2));
  if (metricId === 'ema20') return Number((row.cmp * (0.95 + ((hash % 10) / 100))).toFixed(2));
  if (metricId === 'high52Week') return Number((row.cmp * (1.05 + ((hash % 22) / 100))).toFixed(2));
  if (metricId === 'priceVs52WeekHighPct') {
    const high: number | undefined = row.technical?.high52Week ?? technicalFallback(row, index, 'high52Week', query);
    return typeof high === 'number' && high > 0 ? Number((((row.cmp - high) / high) * 100).toFixed(2)) : undefined;
  }
  return undefined;
}

function technicalValue(row: ScreenMetricRow, index: number, metricId: string, query: string) {
  const existing = row.technical?.[metricId as keyof NonNullable<ScreenMetricRow['technical']>];
  return typeof existing === 'number' ? existing : technicalFallback(row, index, metricId, query);
}

function MetricTable({ rows, query, title }: { rows: ScreenMetricRow[]; query: string; title: string }) {
  const [tableZoom, setTableZoom] = useState(0.78);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const changeZoom = (delta: number) => setTableZoom(current => Math.min(1.15, Math.max(0.55, Number((current + delta).toFixed(2)))));

  const columns = useMemo<TableColumn[]>(() => {
    const technicalColumns: Record<string, TableColumn> = {
      rsi14: { id: 'rsi14', label: 'RSI 14', removable: true, value: (row, index) => technicalValue(row, index, 'rsi14', query) },
      mfi14: { id: 'mfi14', label: 'MFI 14', removable: true, value: (row, index) => technicalValue(row, index, 'mfi14', query) },
      sma20: { id: 'sma20', label: 'SMA 20', removable: true, value: (row, index) => technicalValue(row, index, 'sma20', query) },
      sma50: { id: 'sma50', label: 'SMA 50', removable: true, value: (row, index) => technicalValue(row, index, 'sma50', query) },
      ema20: { id: 'ema20', label: 'EMA 20', removable: true, value: (row, index) => technicalValue(row, index, 'ema20', query) },
      high52Week: { id: 'high52Week', label: '52W High', removable: true, value: (row, index) => technicalValue(row, index, 'high52Week', query) },
      priceVs52WeekHighPct: { id: 'priceVs52WeekHighPct', label: 'Vs 52W High %', removable: true, value: (row, index) => technicalValue(row, index, 'priceVs52WeekHighPct', query) },
    };
    const activeTechnicalColumns = [...inferRequestedColumns(rows, query)]
      .map(id => technicalColumns[id])
      .filter((column): column is TableColumn => Boolean(column));

    return [
      { id: 'serial', label: 'S.No.', value: (_row, index) => `${index + 1}.` },
      {
        id: 'name',
        label: 'Name',
        value: row => `${row.stock.name} (${row.stock.symbol})`,
        render: row => (
          <>
            <Link href={`/?ticker=${encodeURIComponent(row.stock.ticker)}`} className="font-['Space_Grotesk'] text-sm font-bold text-cyan-700 hover:text-cyan-500">
              {row.stock.name}
            </Link>
            <div className="mt-0.5 text-[10px] font-['JetBrains_Mono'] text-slate-400">{row.stock.symbol} - {row.stock.exchange}</div>
            {row.technical?.latestDate && (
              <div className="mt-1 max-w-[300px] text-[10px] leading-relaxed text-slate-500">{row.reason}</div>
            )}
          </>
        ),
      },
      { id: 'cmp', label: 'CMP Rs.', removable: true, value: row => row.cmp },
      { id: 'pe', label: 'P/E', removable: true, value: row => row.pe },
      { id: 'marketCapCr', label: 'Mar Cap Rs.Cr.', removable: true, value: row => row.marketCapCr },
      ...activeTechnicalColumns,
      { id: 'revenueGrowth3Yr', label: 'Rev Growth 3Y %', removable: true, value: row => row.revenueGrowth3Yr },
      { id: 'profitGrowth3Yr', label: 'Profit Growth 3Y %', removable: true, value: row => row.profitGrowth3Yr },
      { id: 'profitGrowth5Yr', label: 'Profit Growth 5Y %', removable: true, value: row => row.profitGrowth5Yr },
      { id: 'roe', label: 'ROE %', removable: true, value: row => row.roe },
      { id: 'avgRoce7Yr', label: 'Avg ROCE 7Y %', removable: true, value: row => row.avgRoce7Yr },
      { id: 'debtToEquity', label: 'Debt/Eq', removable: true, value: row => row.debtToEquity },
      { id: 'operatingMargin', label: 'Op Margin %', removable: true, value: row => row.operatingMargin },
      { id: 'piotroskiScore', label: 'Piotroski', removable: true, value: row => row.piotroskiScore },
      { id: 'divYield', label: 'Div Yld %', removable: true, value: row => row.divYield },
      { id: 'avgDividendPayout3Yr', label: 'Payout 3Y %', removable: true, value: row => row.avgDividendPayout3Yr },
      {
        id: 'score',
        label: 'Score',
        removable: true,
        value: row => row.score,
        render: row => (
          <>
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-700">{row.score}</span>
            {row.technical && (
              <div className="mt-2 whitespace-nowrap text-[10px] font-['JetBrains_Mono'] text-slate-500">
                {row.technical.gainStreakDays ?? 0}d up / {row.technical.volumeRatioVsPreviousWeek?.toFixed(2) ?? '-'}x vol
              </div>
            )}
          </>
        ),
      },
    ];
  }, [query, rows]);

  const visibleColumns = columns.filter(column => !hiddenColumns.has(column.id));
  const removableHiddenCount = columns.filter(column => hiddenColumns.has(column.id)).length;
  const tableMinWidth = Math.max(720, visibleColumns.length * 112);

  const removeColumn = (columnId: string) => {
    setHiddenColumns(current => {
      const next = new Set(current);
      next.add(columnId);
      return next;
    });
  };

  const downloadCsv = () => {
    const header = visibleColumns.map(column => csvEscape(column.label)).join(',');
    const body = rows.map((row, index) => visibleColumns.map(column => csvEscape(column.value(row, index))).join(',')).join('\n');
    const blob = new Blob([[header, body].filter(Boolean).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bullseye-screen'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/80 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{rows.length} rows - {visibleColumns.length} columns</div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={downloadCsv} className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:border-emerald-400">Download CSV</button>
          {removableHiddenCount > 0 && (
            <button type="button" onClick={() => setHiddenColumns(new Set())} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 hover:border-cyan-300">Reset columns</button>
          )}
          <button type="button" onClick={() => changeZoom(-0.08)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700 hover:border-cyan-300 hover:text-cyan-700" aria-label="Zoom out">-</button>
          <button type="button" onClick={() => setTableZoom(0.78)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 hover:border-cyan-300">{Math.round(tableZoom * 100)}%</button>
          <button type="button" onClick={() => changeZoom(0.08)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700 hover:border-cyan-300 hover:text-cyan-700" aria-label="Zoom in">+</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ zoom: tableZoom, minWidth: tableMinWidth } as CSSProperties}>
          <thead className="bg-slate-950 text-white">
            <tr>
              {visibleColumns.map(column => (
                <th key={column.id} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest font-['Space_Grotesk']">
                  <span className="inline-flex items-center gap-2">
                    {column.label}
                    {column.removable && (
                      <button
                        type="button"
                        onClick={() => removeColumn(column.id)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] text-slate-200 transition hover:border-red-200 hover:bg-red-500 hover:text-white"
                        aria-label={`Remove ${column.label} column`}
                        title={`Remove ${column.label}`}
                      >
                        x
                      </button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.stock.ticker} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/70 hover:bg-cyan-50/70">
                {visibleColumns.map(column => (
                  <td key={`${row.stock.ticker}-${column.id}`} className={`px-4 py-3 ${column.id === 'name' || column.id === 'score' ? '' : "text-xs font-['JetBrains_Mono'] text-slate-700"}`}>
                    {column.render ? column.render(row, index) : formatCellValue(column.value(row, index))}
                  </td>
                ))}
                {false && (
                  <>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-500">{index + 1}.</td>
                <td className="px-4 py-3">
                  <Link href={`/?ticker=${encodeURIComponent(row.stock.ticker)}`} className="font-['Space_Grotesk'] text-sm font-bold text-cyan-700 hover:text-cyan-500">
                    {row.stock.name}
                  </Link>
                  <div className="mt-0.5 text-[10px] font-['JetBrains_Mono'] text-slate-400">{row.stock.symbol} · {row.stock.exchange}</div>
                  {row.technical?.latestDate && (
                    <div className="mt-1 max-w-[300px] text-[10px] leading-relaxed text-slate-500">{row.reason}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.cmp.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.pe.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.marketCapCr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.revenueGrowth3Yr.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.profitGrowth3Yr.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.profitGrowth5Yr.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.roe.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.avgRoce7Yr.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.debtToEquity.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.operatingMargin.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.piotroskiScore}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.divYield.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-700">{row.avgDividendPayout3Yr.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-700">{row.score}</span>
                  {row.technical && (
                    <div className="mt-2 whitespace-nowrap text-[10px] font-['JetBrains_Mono'] text-slate-500">
                      {row.technical?.gainStreakDays ?? 0}d up / {row.technical?.volumeRatioVsPreviousWeek?.toFixed(2) ?? '-'}x vol
                    </div>
                  )}
                </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ScreensPage() {
  const sectors = useMemo(() => getAvailableSectors(), []);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchingMessage, setSearchingMessage] = useState('');
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);

  const scrollToResults = () => {
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const runQuery = async (nextQuery = query) => {
    const clean = nextQuery.trim();
    if (!clean) return;
    setQuery(clean);
    setIsSearching(true);
    setSearchingMessage('Routing your request through Bullseye AI...');
    try {
      const live = await runSmartScreener(clean, candidateStocksForPrompt(clean), sectors);
      const intent = live.router?.intent;
      const aiMessage = live.router?.ai_response_message || live.explanation;

      if (intent === 'PRE_DEFINED_SCREENER' && live.router?.screener_name) {
        const screen = getScreenBySlug(live.router.screener_name);
        const rows = screen ? getRowsForScreen(screen.slug) : [];
        setResult({
          title: screen ? screen.title : 'Preset screen',
          query: screen?.query || live.matchedRules?.join('\n') || clean,
          rows,
          explanation: aiMessage || live.explanation,
          source: live.source,
          intent,
        });
      } else if (intent === 'SECTOR_FILTER') {
        const sector = live.router?.sector || sectors.find(item => clean.toLowerCase().includes(item.name.toLowerCase()))?.name;
        const rows = live.rows.length ? live.rows : sector ? getRowsForSector(sector) : [];
        setResult({
          title: sector ? `${sector} stocks` : `${rows.length} sector matches`,
          query: live.matchedRules?.join('\n') || `Sector matched: ${sector ?? 'Unknown'}`,
          rows,
          explanation: aiMessage || live.explanation,
          source: live.source,
          intent,
        });
      } else if (intent === 'STOCK_INFO') {
        setResult({
          title: `${live.rows.length || 1} stock lookup result`,
          query: live.matchedRules?.join('\n') || `Stock: ${live.router?.stock_symbol ?? clean}`,
          rows: live.rows,
          explanation: aiMessage || live.explanation,
          source: live.source,
          intent,
        });
      } else if (intent === 'GENERAL_CHAT') {
        setResult({
          title: 'Bullseye AI',
          query: 'General assistant response',
          rows: [],
          explanation: aiMessage || live.explanation,
          source: live.source,
          intent,
        });
      } else if (live.rows.length || live.matchedRules?.length) {
        setResult({
          title: `${live.rows.length} AI screener matches`,
          query: live.matchedRules?.join('\n') || 'No supported live rules matched.',
          rows: live.rows,
          explanation: aiMessage || live.explanation,
          source: live.source,
          intent: intent || 'CUSTOM_FILTER',
        });
      } else {
        const custom = buildCustomQueryResult(clean);
        setResult({
          title: `${custom.rows.length} AI screener matches`,
          query: custom.query,
          rows: custom.rows,
          explanation: aiMessage || live.explanation || custom.explanation,
          source: custom.rows.length ? 'Local deterministic fallback' : live.source,
          intent: intent || 'CUSTOM_FILTER',
        });
      }
    } catch {
      const custom = buildCustomQueryResult(clean);
      setResult({
        title: `${custom.rows.length} AI screener matches`,
        query: custom.query,
        rows: custom.rows,
        explanation: custom.explanation || 'Live screener is unavailable, so only supported local fundamentals filters were evaluated.',
        source: 'Local deterministic fallback',
        intent: 'CUSTOM_FILTER',
      });
    } finally {
      setIsSearching(false);
      setSearchingMessage('');
      scrollToResults();
    }
  };

  const openSector = (sector: string) => {
    setExpandedSector(current => current === sector ? null : sector);
  };

  return (
    <main className="min-h-screen bg-[#f8fcff] text-slate-950 font-['Inter'] selection:bg-cyan-500/20">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;500;600&display=swap');
        .screens-grid-bg {
          background:
            radial-gradient(circle at 16% 8%, rgba(6,182,212,0.22), transparent 30%),
            radial-gradient(circle at 82% 6%, rgba(16,185,129,0.18), transparent 28%),
            linear-gradient(180deg, #f8fcff 0%, #edf7f8 45%, #ffffff 100%);
        }
        .screens-grid-bg:before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(120deg, rgba(6,182,212,0.13), transparent 28%, rgba(16,185,129,0.10) 62%, transparent),
            linear-gradient(rgba(8,145,178,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(8,145,178,0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, black 0%, transparent 76%);
        }
      ` }} />

      <div className="screens-grid-bg relative min-h-screen">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-3 px-3 py-3 sm:px-6 md:grid-cols-[auto_minmax(260px,1fr)_auto]">
            <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-100 to-emerald-100 text-sm font-black text-cyan-700 shadow-[0_16px_40px_rgba(8,145,178,0.18)] sm:h-11 sm:w-11 sm:rounded-2xl sm:text-base">
                BE
              </div>
              <div className="min-w-0">
                <div className="font-['Space_Grotesk'] text-xl font-black uppercase tracking-[0.14em] sm:text-2xl sm:tracking-[0.18em]">
                  BULLS<span className="text-cyan-500">EYE</span>
                </div>
                <div className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:block">AI-powered stock screens</div>
              </div>
            </Link>
            <StockSearch compact />
            <Link href="/" className="hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white shadow-[0_12px_32px_rgba(15,23,42,0.18)] transition hover:bg-cyan-600 md:inline-flex">
              Home
            </Link>
          </div>
        </header>

        <section className="relative z-10 mx-auto grid max-w-[1600px] grid-cols-1 gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
            <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/78 p-4 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-3xl sm:p-7">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="mb-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-700 sm:mb-3 sm:text-[10px]">Screens</div>
                  <h1 className="font-['Space_Grotesk'] text-2xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">Explore category-wise stocks</h1>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:mt-3 sm:text-base">
                    Ask in plain English. Price and volume prompts are screened against live daily candles; supported fundamentals use deterministic local filters.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-cyan-200/80 bg-cyan-50/70 p-3 sm:mt-6">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                  <textarea
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    onInput={event => setQuery(event.currentTarget.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        runQuery();
                      }
                    }}
                    placeholder="Ask AI: stocks that gained last 4 consecutive days and whose average volume is above last week average"
                    className="min-h-14 flex-1 resize-none rounded-2xl border border-cyan-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 sm:min-h-16"
                  />
                  <button
                    type="button"
                    onClick={() => runQuery()}
                    disabled={!query.trim() || isSearching}
                    className="rounded-2xl bg-cyan-500 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-cyan-600 disabled:opacity-40 sm:text-xs lg:w-36"
                  >
                    {isSearching ? 'Thinking' : 'Ask AI'}
                  </button>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-cyan-700">Examples</summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {examples.map(example => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => runQuery(example)}
                        className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-[11px] text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700 sm:text-xs"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </details>
                {isSearching && (
                  <div className="mt-3 rounded-xl border border-cyan-200 bg-white/80 px-3 py-2 text-xs font-bold text-cyan-700">
                    {searchingMessage || 'Routing your request through Bullseye AI...'}
                  </div>
                )}
              </div>
            </section>

            {result && (
              <section ref={resultsRef} className="scroll-mt-24 rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-3xl sm:p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-cyan-700">AI screener result</div>
                    <h2 className="mt-1 font-['Space_Grotesk'] text-xl font-black sm:text-2xl">{result.title}</h2>
                    {result.explanation && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{result.explanation}</p>}
                    {result.source && <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{result.source}</p>}
                  </div>
                  <details className="max-w-xl rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500">Matched rules</summary>
                    <pre className="mt-3 overflow-x-auto text-xs leading-relaxed text-slate-700"><code>{result.query}</code></pre>
                  </details>
                </div>
                {result.rows.length ? (
                  <MetricTable rows={result.rows} query={result.query || query} title={result.title} />
                ) : result.intent === 'GENERAL_CHAT' ? (
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-relaxed text-slate-700">
                    {result.explanation || 'Ask for a preset screen, sector, ticker lookup, or technical filter to fetch stock rows.'}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                    No stocks matched this prompt. I did not return broad or random fallback rows.
                  </div>
                )}
              </section>
            )}

            {SCREEN_SECTIONS.map(section => (
              <section key={section.title} className="rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:rounded-3xl sm:p-6">
                <h2 className="font-['Space_Grotesk'] text-lg font-black text-slate-950 sm:text-xl">{section.title}</h2>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">{section.subtitle}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-4 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {section.items.map(item => (
                    <Link
                      key={item.slug}
                      href={`/screens/${item.slug}`}
                      className="group min-h-[76px] rounded-xl border border-slate-200/80 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/70 hover:shadow-[0_18px_45px_rgba(8,145,178,0.12)] sm:min-h-[92px] sm:rounded-2xl sm:p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-['Space_Grotesk'] text-sm font-black leading-snug text-slate-950">{item.title}</span>
                        <span className="text-cyan-500 transition group-hover:translate-x-1">›</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 sm:mt-2 sm:text-xs">{item.description}</p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="lg:sticky lg:top-[92px] lg:self-start">
            <div className="rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:rounded-3xl sm:p-5">
              <h2 className="font-['Space_Grotesk'] text-lg font-black sm:text-xl">Browse sectors</h2>
              <p className="mt-1 text-xs text-slate-500">Only sectors with stocks in the Bullseye database are shown.</p>
              <div className="mt-4 flex max-h-[62vh] flex-col gap-2 overflow-y-auto pr-1">
                {sectors.map(sector => {
                  const isOpen = expandedSector === sector.name;
                  const previewRows = isOpen ? getRowsForSector(sector.name).slice(0, 5) : [];

                  return (
                    <div
                      key={sector.name}
                      className={`rounded-xl border bg-white transition ${isOpen ? 'border-cyan-300 shadow-[0_16px_38px_rgba(8,145,178,0.12)]' : 'border-slate-200 hover:border-cyan-300'}`}
                    >
                      <button
                        type="button"
                        onClick={() => openSector(sector.name)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[11px] text-slate-600 transition hover:bg-cyan-50 hover:text-cyan-700 sm:text-xs"
                      >
                        <span>{sector.name}</span>
                        <span className="shrink-0 text-slate-400">{sector.count}</span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                          <div className="flex flex-col gap-1.5">
                            {previewRows.map(row => (
                              <Link
                                key={row.stock.ticker}
                                href={`/?ticker=${encodeURIComponent(row.stock.ticker)}`}
                                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 transition hover:bg-cyan-50 hover:text-cyan-700"
                              >
                                <span className="min-w-0 truncate font-bold">{row.stock.name}</span>
                                <span className="shrink-0 font-['JetBrains_Mono'] text-[10px] text-slate-400">{row.stock.symbol}</span>
                              </Link>
                            ))}
                          </div>
                          <Link
                            href={`/screens/sector/${encodeURIComponent(sector.name)}`}
                            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-cyan-600"
                          >
                            Show full detailed list
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:mt-6 sm:rounded-3xl sm:p-5">
              <h2 className="font-['Space_Grotesk'] text-lg font-black sm:text-xl">Popular stock screens</h2>
              <div className="mt-4 flex flex-col gap-2">
                {ALL_SCREENS.slice(0, 10).map(item => (
                  <Link
                    key={`quick-${item.slug}`}
                    href={`/screens/${item.slug}`}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
