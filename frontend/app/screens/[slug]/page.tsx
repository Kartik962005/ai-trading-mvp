'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ALL_SCREENS, buildCustomQueryResult, getRowsForScreen, getScreenBySlug } from '../screen-data';
import ScreenMetricTable from '../ScreenMetricTable';
import StockSearch from '../StockSearch';
import { enrichScreenRows } from '../enrichRows';

export default function ScreenDetailPage() {
  const params = useParams<{ slug: string }>();
  const screen = getScreenBySlug(params.slug);
  const initialRows = useMemo(() => getRowsForScreen(params.slug), [params.slug]);
  const [query, setQuery] = useState(screen?.query ?? '');
  const [rows, setRows] = useState(initialRows);
  const [activeTitle, setActiveTitle] = useState(screen?.title ?? 'Stock screen');

  useEffect(() => {
    let cancelled = false;
    setRows(initialRows);
    enrichScreenRows(initialRows).then(nextRows => {
      if (!cancelled) setRows(nextRows);
    });
    return () => {
      cancelled = true;
    };
  }, [initialRows]);

  if (!screen) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <h1 className="font-['Space_Grotesk'] text-3xl font-black">Screen not found</h1>
        <Link href="/screens" className="mt-4 inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold">Back to screens</Link>
      </main>
    );
  }

  const runCustomQuery = async () => {
    const result = buildCustomQueryResult(query);
    setRows(result.rows);
    setActiveTitle('Custom query result');
    setRows(await enrichScreenRows(result.rows));
  };

  return (
    <main className="bullseye-night relative min-h-screen bg-black font-body text-paper selection:bg-accent/25">
      {/* Ambient scene — same language as the homepage and screener index. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-black" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(820px 520px at 20% 4%, rgba(52,211,153,0.10), transparent 62%), radial-gradient(680px 460px at 84% 10%, rgba(245,196,81,0.07), transparent 58%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.74) 45%, rgba(0,0,0,0.93) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen">
        <header className="relative z-40 border-b border-hairline bg-black/55 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-4 px-5 py-5 sm:px-8 md:grid-cols-[auto_minmax(240px,1fr)_auto]">
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="inline-flex h-[7px] w-[7px] shrink-0 rounded-full bg-accent shadow-[0_0_14px_rgba(245,196,81,0.85)]"
              />
              <span className="font-display text-[26px] leading-none text-paper">
                Bulls<span className="text-accent">eye</span>
              </span>
            </Link>
            <StockSearch compact />
            <Link
              href="/screens"
              className="hidden h-10 items-center justify-center rounded-full bg-accent px-5 font-body text-[13px] font-semibold text-black transition duration-300 hover:bg-accent-dim md:inline-flex"
            >
              All screens
            </Link>
          </div>
        </header>

        <section className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-5 py-14 sm:px-8">
          {/* Screen header — editorial title with the numbers as a stat rail
              rather than three boxed cards. */}
          <div>
            <Link
              href="/screens"
              className="inline-flex items-center gap-2 font-body text-[12px] text-paper-muted transition hover:text-accent"
            >
              <span aria-hidden>←</span> All screens
            </Link>

            <div className="mt-6 flex items-center gap-3">
              <span aria-hidden className="h-px w-8 bg-accent/60" />
              <span className="font-body text-[11px] font-medium uppercase tracking-[0.28em] text-accent">
                Preset screen
              </span>
            </div>

            <h1 className="mt-5 max-w-[20ch] font-display text-[clamp(2.2rem,5vw,3.6rem)] font-normal leading-[1.02] text-paper">
              {activeTitle}
            </h1>
            <p className="mt-4 max-w-[62ch] font-body text-[15px] leading-8 text-paper-muted">
              {screen.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-x-12 gap-y-5 border-y border-hairline py-5">
              {[
                ['Results', String(rows.length)],
                [
                  'Avg score',
                  String(Math.round(rows.reduce((sum, row) => sum + row.score, 0) / Math.max(rows.length, 1))),
                ],
                [
                  'Top ROCE',
                  (() => {
                    const values = rows.map(row => row.roce).filter((value): value is number => typeof value === 'number');
                    return values.length ? `${Math.max(...values).toFixed(1)}%` : '—';
                  })(),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-body text-[10px] font-medium uppercase tracking-[0.22em] text-paper-muted">
                    {label}
                  </div>
                  <div className="mt-1.5 font-numeric text-lg leading-none text-paper">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <ScreenMetricTable rows={rows} query={query} title={activeTitle} />

          {/* Query editor */}
          <section
            className="rounded-[22px] border border-accent/30 p-6 sm:p-8"
            style={{
              background:
                'linear-gradient(145deg, rgba(20,22,19,0.94) 0%, rgba(8,10,9,0.97) 55%, rgba(16,18,15,0.94) 100%)',
              boxShadow: '0 26px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(245,196,81,0.14)',
            }}
          >
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <h2 className="font-display text-[24px] leading-tight text-paper">Edit the query</h2>
                <p className="mt-2 max-w-[54ch] font-body text-[13px] leading-7 text-paper-muted">
                  Tweak the rules below and re-run them against the Bullseye stock universe.
                </p>
                <textarea
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  className="mt-5 h-40 w-full resize-none rounded-2xl border border-hairline bg-white/[0.03] p-4 font-numeric text-[13px] leading-6 text-paper outline-none transition placeholder:text-paper-muted/60 focus:border-accent/55 focus:bg-white/[0.05]"
                />
                <button
                  type="button"
                  onClick={runCustomQuery}
                  className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-accent px-7 font-body text-[13px] font-semibold text-black transition duration-300 hover:bg-accent-dim"
                >
                  Run this query
                </button>
              </div>

              <aside className="border-t border-hairline pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <div className="font-body text-[10px] font-medium uppercase tracking-[0.24em] text-accent">
                  Example
                </div>
                <pre className="mt-4 whitespace-pre-wrap font-numeric text-[12px] leading-6 text-paper-muted">{`Market capitalization > 500 AND
Price to earning < 15 AND
Return on capital employed > 22%`}</pre>

                <div className="mt-8 font-body text-[10px] font-medium uppercase tracking-[0.24em] text-paper-muted">
                  Other screens
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {ALL_SCREENS.slice(0, 5).map(item => (
                    <Link
                      key={item.slug}
                      href={`/screens/${item.slug}`}
                      className="font-body text-[13px] text-paper-muted transition hover:text-accent"
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
              </aside>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
