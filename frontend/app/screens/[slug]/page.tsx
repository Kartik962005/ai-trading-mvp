'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ALL_SCREENS, buildCustomQueryResult, getRowsForScreen, getScreenBySlug } from '../screen-data';
import ScreenMetricTable from '../ScreenMetricTable';
import StockSearch from '../StockSearch';

export default function ScreenDetailPage() {
  const params = useParams<{ slug: string }>();
  const screen = getScreenBySlug(params.slug);
  const initialRows = useMemo(() => getRowsForScreen(params.slug), [params.slug]);
  const [query, setQuery] = useState(screen?.query ?? '');
  const [rows, setRows] = useState(initialRows);
  const [activeTitle, setActiveTitle] = useState(screen?.title ?? 'Stock screen');

  if (!screen) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <h1 className="font-['Space_Grotesk'] text-3xl font-black">Screen not found</h1>
        <Link href="/screens" className="mt-4 inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold">Back to screens</Link>
      </main>
    );
  }

  const runCustomQuery = () => {
    const result = buildCustomQueryResult(query);
    setRows(result.rows);
    setActiveTitle('Custom query result');
  };

  return (
    <main className="min-h-screen bg-[#f8fcff] text-slate-950 font-['Inter'] selection:bg-cyan-500/20">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;500;600&display=swap');
        .screen-detail-bg {
          background:
            radial-gradient(circle at 16% 8%, rgba(6,182,212,0.22), transparent 30%),
            radial-gradient(circle at 82% 6%, rgba(16,185,129,0.18), transparent 28%),
            linear-gradient(180deg, #f8fcff 0%, #edf7f8 45%, #ffffff 100%);
        }
        .screen-detail-bg:before {
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

      <div className="screen-detail-bg relative min-h-screen">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-3 px-3 py-3 sm:px-6 md:grid-cols-[auto_minmax(260px,1fr)_auto]">
            <Link href="/screens" className="flex items-center gap-2 sm:gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-100 to-emerald-100 text-sm font-black text-cyan-700 sm:h-11 sm:w-11 sm:rounded-2xl sm:text-base">BE</div>
              <div>
                <div className="font-['Space_Grotesk'] text-xl font-black uppercase tracking-[0.14em] sm:text-2xl sm:tracking-[0.18em]">BULLS<span className="text-cyan-500">EYE</span></div>
                <div className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:block">Screen results</div>
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
                <div className="mb-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-700 sm:mb-3 sm:text-[10px]">Preset screen</div>
                <h1 className="font-['Space_Grotesk'] text-2xl font-black tracking-tight sm:text-4xl lg:text-5xl">{activeTitle}</h1>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500 sm:mt-3 sm:text-sm">{screen.description}</p>
                <p className="mt-2 text-xs text-slate-500 sm:mt-3 sm:text-sm">
                  {rows.length} results found · Showing page 1 of 1
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:min-w-[420px] sm:gap-3">
                {[
                  ['Results', rows.length],
                  ['Avg score', Math.round(rows.reduce((sum, row) => sum + row.score, 0) / Math.max(rows.length, 1))],
                  ['Top ROCE', `${Math.max(...rows.map(row => row.roce)).toFixed(1)}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 sm:text-[10px]">{label}</div>
                    <div className="mt-1.5 font-['JetBrains_Mono'] text-lg font-black text-slate-950 sm:mt-2 sm:text-xl">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ScreenMetricTable rows={rows} query={query} title={activeTitle} />

          <section className="grid grid-cols-1 gap-4 rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:rounded-3xl sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h2 className="font-['Space_Grotesk'] text-lg font-black sm:text-xl">Search Query</h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">Customize the query below, then run it against the local Bullseye stock universe.</p>
              <textarea
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="mt-3 h-32 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 font-['JetBrains_Mono'] text-xs text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 sm:mt-4 sm:h-40 sm:rounded-2xl sm:p-4 sm:text-sm"
              />
              <button
                type="button"
                onClick={runCustomQuery}
                className="mt-3 rounded-xl bg-cyan-500 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-cyan-600 sm:mt-4 sm:rounded-2xl sm:px-6 sm:text-xs"
              >
                Run this query
              </button>
            </div>
            <aside className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 sm:p-5">
              <h3 className="font-['Space_Grotesk'] text-base font-black sm:text-lg">Custom query example</h3>
              <pre className="mt-3 whitespace-pre-wrap font-['JetBrains_Mono'] text-[11px] leading-relaxed text-slate-700 sm:mt-4 sm:text-xs">{`Market capitalization > 500 AND
Price to earning < 15 AND
Return on capital employed > 22%`}</pre>
              <div className="mt-5 text-[10px] font-black uppercase tracking-widest text-cyan-700">Try preset screens</div>
              <div className="mt-3 flex flex-col gap-2">
                {ALL_SCREENS.slice(0, 5).map(item => (
                  <Link key={item.slug} href={`/screens/${item.slug}`} className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700">
                    {item.title}
                  </Link>
                ))}
              </div>
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}
