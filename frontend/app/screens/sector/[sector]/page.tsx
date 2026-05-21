'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState, type CSSProperties } from 'react';
import { getRowsForSector, type ScreenMetricRow } from '../../screen-data';
import StockSearch from '../../StockSearch';

function SectorTable({ rows }: { rows: ScreenMetricRow[] }) {
  const [tableZoom, setTableZoom] = useState(0.82);
  const changeZoom = (delta: number) => setTableZoom(current => Math.min(1.15, Math.max(0.55, Number((current + delta).toFixed(2)))));

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Table zoom</div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => changeZoom(-0.08)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700 hover:border-cyan-300 hover:text-cyan-700" aria-label="Zoom out">-</button>
          <button type="button" onClick={() => setTableZoom(0.82)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 hover:border-cyan-300">{Math.round(tableZoom * 100)}%</button>
          <button type="button" onClick={() => changeZoom(0.08)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700 hover:border-cyan-300 hover:text-cyan-700" aria-label="Zoom in">+</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left" style={{ zoom: tableZoom } as CSSProperties}>
          <thead className="bg-slate-950 text-white">
            <tr>
              {['S.No.', 'Name', 'CMP Rs.', 'P/E', 'Market Cap Cr.', 'Div Yld %', 'Qtr Sales Cr.', 'Profit Var %', 'Sales Var %', 'ROCE %', 'Score'].map(label => (
                <th key={label} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest font-['Space_Grotesk']">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.stock.ticker} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/70 hover:bg-cyan-50/70">
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono'] text-slate-500">{index + 1}.</td>
                <td className="px-4 py-3">
                  <Link href={`/?ticker=${encodeURIComponent(row.stock.ticker)}`} className="font-['Space_Grotesk'] text-sm font-bold text-cyan-700 hover:text-cyan-500">
                    {row.stock.name}
                  </Link>
                  <div className="mt-1 max-w-[280px] text-[10px] leading-relaxed text-slate-500">{row.reason}</div>
                </td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono']">{row.cmp.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono']">{row.pe.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono']">{row.marketCapCr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono']">{row.divYield.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono']">{row.qtrSalesCr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className={`px-4 py-3 text-xs font-bold font-['JetBrains_Mono'] ${row.qtrProfitVar >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{row.qtrProfitVar.toFixed(2)}</td>
                <td className={`px-4 py-3 text-xs font-bold font-['JetBrains_Mono'] ${row.qtrSalesVar >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{row.qtrSalesVar.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs font-['JetBrains_Mono']">{row.roce.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-700">{row.score}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SectorDetailPage() {
  const params = useParams<{ sector: string }>();
  const sector = decodeURIComponent(params.sector);
  const rows = useMemo(() => getRowsForSector(sector), [sector]);
  const averageScore = Math.round(rows.reduce((sum, row) => sum + row.score, 0) / Math.max(rows.length, 1));
  const topRoce = rows.length ? Math.max(...rows.map(row => row.roce)).toFixed(1) : '0.0';

  return (
    <main className="min-h-screen bg-[#f8fcff] text-slate-950 font-['Inter'] selection:bg-cyan-500/20">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;500;600&display=swap');
        .sector-detail-bg {
          background:
            radial-gradient(circle at 16% 8%, rgba(6,182,212,0.22), transparent 30%),
            radial-gradient(circle at 82% 6%, rgba(16,185,129,0.18), transparent 28%),
            linear-gradient(180deg, #f8fcff 0%, #edf7f8 45%, #ffffff 100%);
        }
        .sector-detail-bg:before {
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

      <div className="sector-detail-bg relative min-h-screen">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-3 px-3 py-3 sm:px-6 md:grid-cols-[auto_minmax(260px,1fr)_auto]">
            <Link href="/screens" className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-100 to-emerald-100 text-sm font-black text-cyan-700 sm:h-11 sm:w-11 sm:rounded-2xl sm:text-base">BE</div>
              <div className="min-w-0">
                <div className="font-['Space_Grotesk'] text-xl font-black uppercase tracking-[0.14em] sm:text-2xl sm:tracking-[0.18em]">BULLS<span className="text-cyan-500">EYE</span></div>
                <div className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:block">Sector results</div>
              </div>
            </Link>
            <StockSearch compact />
            <Link href="/screens" className="hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-cyan-600 md:inline-flex">All screens</Link>
          </div>
        </header>

        <section className="relative z-10 mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6">
          <div className="rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-3xl sm:p-7">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-700 sm:mb-3 sm:text-[10px]">Sector screen</div>
                <h1 className="font-['Space_Grotesk'] text-2xl font-black tracking-tight sm:text-4xl lg:text-5xl">{sector}</h1>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500 sm:mt-3 sm:text-sm">
                  Stocks loaded from the Bullseye database for this sector, sorted by market cap and quality score.
                </p>
                <p className="mt-2 text-xs text-slate-500 sm:mt-3 sm:text-sm">{rows.length} results found - Showing page 1 of 1</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:min-w-[420px] sm:gap-3">
                {[
                  ['Results', rows.length],
                  ['Avg score', averageScore],
                  ['Top ROCE', `${topRoce}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 sm:text-[10px]">{label}</div>
                    <div className="mt-1.5 font-['JetBrains_Mono'] text-lg font-black text-slate-950 sm:mt-2 sm:text-xl">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {rows.length ? (
            <SectorTable rows={rows} />
          ) : (
            <div className="rounded-2xl border border-white/70 bg-white/82 p-6 text-sm text-slate-500 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
              No stocks are loaded for this sector yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
