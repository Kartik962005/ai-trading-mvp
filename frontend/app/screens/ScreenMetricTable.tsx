'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ScreenMetricRow } from './screen-data';

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

function csvEscape(value: string | number | null | undefined) {
  const text = formatCellValue(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function getTechnicalValue(row: ScreenMetricRow, metricId: string) {
  const existing = row.technical?.[metricId as keyof NonNullable<ScreenMetricRow['technical']>];
  return typeof existing === 'number' ? existing : undefined;
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

export default function ScreenMetricTable({ rows, query, title }: { rows: ScreenMetricRow[]; query: string; title: string }) {
  const [tableZoom, setTableZoom] = useState(0.78);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const changeZoom = (delta: number) => setTableZoom(current => Math.min(1.15, Math.max(0.55, Number((current + delta).toFixed(2)))));

  const columns = useMemo<TableColumn[]>(() => {
    const technicalColumns: Record<string, TableColumn> = {
      rsi14: { id: 'rsi14', label: 'RSI 14', removable: true, value: row => getTechnicalValue(row, 'rsi14') },
      mfi14: { id: 'mfi14', label: 'MFI 14', removable: true, value: row => getTechnicalValue(row, 'mfi14') },
      sma20: { id: 'sma20', label: 'SMA 20', removable: true, value: row => getTechnicalValue(row, 'sma20') },
      sma50: { id: 'sma50', label: 'SMA 50', removable: true, value: row => getTechnicalValue(row, 'sma50') },
      ema20: { id: 'ema20', label: 'EMA 20', removable: true, value: row => getTechnicalValue(row, 'ema20') },
      high52Week: { id: 'high52Week', label: '52W High', removable: true, value: row => getTechnicalValue(row, 'high52Week') },
      priceVs52WeekHighPct: { id: 'priceVs52WeekHighPct', label: 'Vs 52W High %', removable: true, value: row => getTechnicalValue(row, 'priceVs52WeekHighPct') },
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
            {row.reason && <div className="mt-1 max-w-[300px] text-[10px] leading-relaxed text-slate-500">{row.reason}</div>}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
