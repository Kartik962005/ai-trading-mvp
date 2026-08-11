'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/client-cache';

/**
 * Every past Bullseye call on this stock, and how it actually resolved.
 *
 * The rest of the page shows the CURRENT verdict, which is unfalsifiable at the
 * moment you read it. This is the falsifiable part: the previous calls, whether
 * they hit target or stopped out, and the hit rate over the closed ones.
 *
 * Two deliberate honesty rules:
 *  - the hit rate is computed over RESOLVED trades only, so open positions can
 *    never inflate it;
 *  - with nothing closed yet we say so plainly rather than rendering 0%, which
 *    would read as "every call lost".
 */

type TrackRecordSignal = {
  id: string;
  run_date?: string | null;
  target_date?: string | null;
  direction?: string | null;
  setup_type?: string | null;
  entry_low?: number | null;
  entry_high?: number | null;
  target_price?: number | null;
  stop_loss?: number | null;
  confidence?: number | null;
  outcome: 'WIN' | 'LOSS' | 'NEUTRAL' | 'PENDING';
  realized_r?: number | null;
};

type TrackRecordResponse = {
  symbol: string;
  signals: TrackRecordSignal[];
  summary: {
    total: number;
    resolved: number;
    pending: number;
    wins: number;
    losses: number;
    neutral: number;
    hit_rate: number | null;
    avg_realized_r: number | null;
  };
};

const OUTCOME_STYLE: Record<string, string> = {
  WIN: 'border-primary/40 bg-primary/10 text-primary',
  LOSS: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
  NEUTRAL: 'border-hairline bg-white/[0.04] text-paper-muted',
  PENDING: 'border-accent/30 bg-accent/[0.07] text-accent',
};

const OUTCOME_LABEL: Record<string, string> = {
  WIN: 'Hit target',
  LOSS: 'Stopped out',
  NEUTRAL: 'Neither hit',
  PENDING: 'Open',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-hairline bg-white/[0.02] p-6 sm:p-7">
      <div className="mb-5 border-b border-hairline pb-4">
        <h3 className="font-display text-xl leading-none text-paper">Our track record here</h3>
        <p className="mt-2 font-body text-[11px] leading-relaxed text-paper-muted">
          Past Bullseye calls on this stock and how each one resolved. Hit rate counts
          closed calls only.
        </p>
      </div>
      {children}
    </section>
  );
}

export function TrackRecord({ symbol, currency = '₹' }: { symbol?: string | null; currency?: string }) {
  const clean = (symbol || '').replace('.NS', '').replace('.BO', '').toUpperCase();
  const { data, error, isLoading } = useSWR<TrackRecordResponse>(
    clean ? `/api/v1/stocks/${encodeURIComponent(clean)}/track-record` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (!clean) return null;

  if (isLoading) {
    return (
      <Shell>
        <div className="py-6 text-center font-body text-[11px] uppercase tracking-widest text-paper-muted">
          Loading past calls…
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <p className="font-body text-[12px] text-paper-muted">
          Couldn&apos;t load the track record right now.
        </p>
      </Shell>
    );
  }

  const signals = data?.signals ?? [];
  const summary = data?.summary;

  if (!signals.length) {
    return (
      <Shell>
        <p className="font-body text-[12px] leading-relaxed text-paper-muted">
          Bullseye hasn&apos;t issued a signal on {clean} yet. Once it does, every call and
          its outcome will be listed here — including the ones that lost.
        </p>
      </Shell>
    );
  }

  const hitRate = summary?.hit_rate;
  const resolved = summary?.resolved ?? 0;

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <div className="font-body text-[10px] font-medium uppercase tracking-[0.22em] text-paper-muted">
            Hit rate
          </div>
          <div className="mt-1.5 font-numeric text-2xl leading-none text-paper">
            {hitRate === null || hitRate === undefined
              ? '—'
              : `${Math.round(hitRate * 100)}%`}
          </div>
          <div className="mt-1 font-body text-[10px] text-paper-muted">
            {resolved > 0 ? `over ${resolved} closed call${resolved === 1 ? '' : 's'}` : 'nothing closed yet'}
          </div>
        </div>
        <div>
          <div className="font-body text-[10px] font-medium uppercase tracking-[0.22em] text-paper-muted">
            Average R
          </div>
          <div className="mt-1.5 font-numeric text-2xl leading-none text-paper">
            {summary?.avg_realized_r === null || summary?.avg_realized_r === undefined
              ? '—'
              : summary.avg_realized_r.toFixed(2)}
          </div>
          <div className="mt-1 font-body text-[10px] text-paper-muted">per closed call</div>
        </div>
        <div>
          <div className="font-body text-[10px] font-medium uppercase tracking-[0.22em] text-paper-muted">
            Calls
          </div>
          <div className="mt-1.5 font-numeric text-2xl leading-none text-paper">{summary?.total ?? signals.length}</div>
          <div className="mt-1 font-body text-[10px] text-paper-muted">
            {summary?.pending ? `${summary.pending} still open` : 'all closed'}
          </div>
        </div>
      </div>

      {resolved === 0 && (
        <p className="mb-5 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 font-body text-[11px] leading-relaxed text-paper-muted">
          None of these have reached their target date yet, so there is no hit rate to
          report. Outcomes are recorded automatically after each target date closes.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {signals.map(signal => {
          const style = OUTCOME_STYLE[signal.outcome] ?? OUTCOME_STYLE.NEUTRAL;
          return (
            <li
              key={signal.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-numeric text-[13px] text-paper">
                  {signal.direction} · target {currency}
                  {Number(signal.target_price ?? 0).toLocaleString()} · stop {currency}
                  {Number(signal.stop_loss ?? 0).toLocaleString()}
                </div>
                <div className="mt-1 font-body text-[10px] uppercase tracking-wider text-paper-muted">
                  for {signal.target_date ?? '—'}
                  {signal.setup_type ? ` · ${String(signal.setup_type).replace(/_/g, ' ')}` : ''}
                  {typeof signal.confidence === 'number'
                    ? ` · ${Math.round(signal.confidence * 100)}% confidence`
                    : ''}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {typeof signal.realized_r === 'number' && (
                  <span className="font-numeric text-[12px] text-paper-muted">
                    {signal.realized_r > 0 ? '+' : ''}
                    {signal.realized_r.toFixed(2)}R
                  </span>
                )}
                <span
                  className={`rounded-full border px-3 py-1 font-body text-[9px] font-semibold uppercase tracking-widest ${style}`}
                >
                  {OUTCOME_LABEL[signal.outcome] ?? signal.outcome}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
