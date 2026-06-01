'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const BACKEND = '/api/backend';
const DISCLAIMER_FALLBACK =
  'Educational only: Bullseye is not a SEBI-registered investment advisor. Backtests can be overfit; costs and slippage reduce returns; about 1 in 3 trades can lose. Signals are computed after close for the next morning open.';

type StrategyResult = {
  success?: boolean;
  message?: string;
  strategy_json?: Record<string, unknown> | null;
  stats?: Record<string, number> | null;
  out_of_sample?: Record<string, number> | null;
  quality?: { alertable?: boolean; reason?: string };
  alertable?: boolean;
  recent_signals?: Array<{ ticker: string; symbol?: string; signal_date: string; close?: number }>;
  disclaimer?: string;
};

type SavedStrategy = {
  id: string;
  name: string;
  nl_text: string;
  strategy_json: Record<string, unknown>;
  quality?: { alertable?: boolean; reason?: string; disclaimer?: string };
  enabled: boolean;
  created_at?: string;
  last_run_date?: string | null;
};

let supabaseClientPromise: Promise<any> | null = null;

async function getSharedSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  if (typeof window === 'undefined') return null;
  const globalKey = '__bullseyeSupabaseClient';
  const browserWindow = window as any;
  if (browserWindow[globalKey]) return browserWindow[globalKey];
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      if (!browserWindow[globalKey]) browserWindow[globalKey] = createClient(supabaseUrl, supabaseKey);
      return browserWindow[globalKey];
    });
  }
  return supabaseClientPromise;
}

function fmt(value: unknown, suffix = '') {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(2)}${suffix}`;
}

export default function AlertsPage() {
  const [user, setUser] = useState<any>(null);
  const [prompt, setPrompt] = useState('Buy NSE stocks that gap up 2% or more but are still below their 10-day VWAP, skip IT and Metals, buy next day open, 15% stop, hold 20 days.');
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseAvailable = !!(supabaseUrl && supabaseKey);

  async function token() {
    if (!supabaseAvailable) return null;
    const sb = await getSharedSupabaseClient(supabaseUrl!, supabaseKey!);
    const session = await sb?.auth.getSession();
    return session?.data?.session?.access_token ?? null;
  }

  async function headers() {
    const accessToken = await token();
    if (!accessToken) throw new Error('Please sign in before saving strategy alerts.');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
  }

  async function loadStrategies() {
    try {
      const authHeaders = await headers();
      const response = await fetch(`${BACKEND}/api/v1/strategies`, { headers: authHeaders, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not load strategies.');
      setStrategies(Array.isArray(data.strategies) ? data.strategies : []);
    } catch (err) {
      setStrategies([]);
      if (user) setError(err instanceof Error ? err.message : 'Could not load strategies.');
    }
  }

  useEffect(() => {
    if (!supabaseAvailable) return;
    getSharedSupabaseClient(supabaseUrl!, supabaseKey!).then(async (sb) => {
      const session = await sb?.auth.getSession();
      setUser(session?.data?.session?.user ?? null);
    });
  }, [supabaseAvailable, supabaseKey, supabaseUrl]);

  useEffect(() => {
    if (user) loadStrategies().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function runBacktest() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND}/api/v1/strategies/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nl_text: prompt }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Backtest failed.');
      setResult(data);
      if (data.success === false) setError(data.message || 'This strategy is not supported yet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed.');
    } finally {
      setLoading(false);
    }
  }

  async function saveStrategy() {
    if (!result?.strategy_json) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const authHeaders = await headers();
      const response = await fetch(`${BACKEND}/api/v1/strategies`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: prompt.slice(0, 80),
          nl_text: prompt,
          strategy_json: result.strategy_json,
          quality: result.quality,
          enabled: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not save strategy.');
      setMessage('Strategy saved for daily alerts.');
      await loadStrategies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save strategy.');
    } finally {
      setLoading(false);
    }
  }

  async function patchStrategy(id: string, enabled: boolean) {
    const authHeaders = await headers();
    const response = await fetch(`${BACKEND}/api/v1/strategies/${id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) throw new Error('Could not update strategy.');
    await loadStrategies();
  }

  async function deleteStrategy(id: string) {
    const authHeaders = await headers();
    const response = await fetch(`${BACKEND}/api/v1/strategies/${id}`, { method: 'DELETE', headers: authHeaders });
    if (!response.ok) throw new Error('Could not delete strategy.');
    await loadStrategies();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-display text-lg font-black tracking-tight text-slate-900">Bullseye Alerts</Link>
          <Link href="/ask-ai" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-cyan-300 hover:text-cyan-700">Ask AI</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-700">AI Strategy</div>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Backtest a daily alert rule</h1>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="mt-4 min-h-32 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-cyan-400"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={runBacktest} disabled={loading} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {loading ? 'Running...' : 'Run bounded backtest'}
            </button>
            <button type="button" onClick={saveStrategy} disabled={loading || !result?.strategy_json} className="rounded-lg border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800 disabled:opacity-50">
              Enable daily alerts
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}

          {result?.stats && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-bold">{result.alertable ? 'Quality gate passed' : 'Quality gate not met'}</div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{result.quality?.reason}</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div><div className="text-xs text-slate-500">Trades</div><div className="font-bold">{result.stats.trades ?? 0}</div></div>
                <div><div className="text-xs text-slate-500">Win rate</div><div className="font-bold">{fmt(result.stats.win_rate, '%')}</div></div>
                <div><div className="text-xs text-slate-500">Avg trade</div><div className="font-bold">{fmt(result.stats.avg_return_per_trade, '%')}</div></div>
                <div><div className="text-xs text-slate-500">Max drawdown</div><div className="font-bold">{fmt(result.stats.max_drawdown, '%')}</div></div>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">{result.disclaimer || DISCLAIMER_FALLBACK}</p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Saved strategies</div>
            {!user && <p className="mt-2 text-sm text-slate-500">Sign in from the home page to save alerts.</p>}
            <div className="mt-3 space-y-3">
              {strategies.map((strategy) => (
                <div key={strategy.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="font-bold">{strategy.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{strategy.quality?.reason || 'No quality note'}</div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => patchStrategy(strategy.id, !strategy.enabled).catch((err) => setError(err.message))} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold">
                      {strategy.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" onClick={() => deleteStrategy(strategy.id).catch((err) => setError(err.message))} className="rounded border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
