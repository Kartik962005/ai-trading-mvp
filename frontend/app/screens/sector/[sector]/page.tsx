'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { getRowsForSector } from '../../screen-data';
import ScreenMetricTable from '../../ScreenMetricTable';
import StockSearch from '../../StockSearch';

export default function SectorDetailPage() {
  const params = useParams<{ sector: string }>();
  const sector = decodeURIComponent(params.sector);
  const rows = useMemo(() => getRowsForSector(sector), [sector]);
  const averageScore = Math.round(rows.reduce((sum, row) => sum + row.score, 0) / Math.max(rows.length, 1));
  const roceValues = rows.map(row => row.roce).filter((value): value is number => typeof value === 'number');
  const topRoce = roceValues.length ? Math.max(...roceValues).toFixed(1) : '-';

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
            <ScreenMetricTable rows={rows} query={`Sector: ${sector}`} title={`${sector} stocks`} />
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
