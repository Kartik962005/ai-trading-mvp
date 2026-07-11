'use client';
import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { STOCKS } from './stocks';
import {
  DailySignalPreviewCard,
  HomeFeatureSection,
  HomeHero,
  MarketScanSection,
  MarketSwitcher,
} from '@/components/home';
import BlurText from '@/components/ui/BlurText';

const BACKEND = '/api/backend';
const fetcher = async (url: string) => {
  const response = await fetch(`${BACKEND}${url}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `Request failed: ${response.status}`);
  }
  return data;
};
const CACHE_TTL = 1000 * 60 * 60 * 6;
type NewsStory = {
  title: string;
  source?: string;
  url?: string | null;
};
type MarketScope = 'INDIA' | 'US';
type DashboardView = 'overview' | 'details';
type ChartRange = '1d' | '1w' | '1mo' | '1y' | 'max';

const STRATEGY_NAMES: Record<number, string> = {
  1: 'Moving Average Crossover',
  2: 'EMA Pullback',
  3: 'Supertrend',
  4: 'Breakout Trading',
  5: 'Trendline Breakout + Retest',
  6: 'Volume Anomaly',
  7: 'Relative Strength',
  8: 'Momentum Ignition',
  9: 'VWAP Trend',
  10: 'Gap-Up Momentum',
  11: 'RSI Divergence',
  12: 'MACD Divergence',
  13: 'Mean Reversion',
  14: 'Bollinger Band Reversal',
  15: 'Volatility Expansion',
  16: 'ATR Breakout',
  17: 'Liquidity Sweep',
  18: 'Order Block',
  19: 'Support/Resistance Flip',
  20: 'Multi-Factor AI Strategy',
};

function normalizeStrategyEvals(strategyEvals: any) {
  const entries: Array<[string, any]> = Array.isArray(strategyEvals)
    ? strategyEvals.map((value, index) => [String(value?.id ?? index + 1), value])
    : Object.entries(strategyEvals ?? {});

  return entries
    .map(([id, value]) => {
      const numericId = Number(id);
      return {
        id: numericId || id,
        name: value?.name ?? STRATEGY_NAMES[numericId] ?? `Strategy ${id}`,
        score: Number(value?.score ?? 0),
        desc: value?.desc ?? 'Signal details unavailable.',
      };
    })
    .filter(strategy => Number.isFinite(strategy.score))
    .sort((a, b) => b.score - a.score);
}

function toFiniteNumber(value: any, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getAnalysisPresentation(analysis: any) {
  if (!analysis || analysis.error) return null;

  const entry = toFiniteNumber(analysis.entry, toFiniteNumber(analysis.current_price, 0));
  const target = toFiniteNumber(analysis.target, entry);
  const stopLoss = toFiniteNumber(analysis.stop_loss, entry);
  const originalVerdict = String(analysis.verdict ?? '').trim();
  const isNoTrade = analysis.signal_status === 'no_trade' || /^hold$/i.test(originalVerdict);

  const bullishSetup = target > entry && stopLoss < entry;
  const bearishSetup = target < entry && stopLoss > entry;

  let displayVerdict = originalVerdict || 'Hold';

  if (isNoTrade) {
    displayVerdict = 'Hold';
  } else if (bearishSetup) {
    displayVerdict = originalVerdict.includes('Strong') ? 'Strong Sell' : 'Sell';
  } else if (bullishSetup) {
    displayVerdict = /sell/i.test(originalVerdict)
      ? originalVerdict.includes('Strong') ? 'Strong Buy' : 'Buy'
      : originalVerdict || 'Buy';
  }

  const direction = isNoTrade ? 'neutral' : bearishSetup ? 'bearish' : bullishSetup ? 'bullish' : 'neutral';
  const isBullish = !isNoTrade && (direction === 'bullish' || /buy/i.test(displayVerdict));
  const isBearish = !isNoTrade && (direction === 'bearish' || /sell/i.test(displayVerdict));

  return {
    ...analysis,
    entry,
    target,
    stop_loss: stopLoss,
    displayVerdict,
    direction,
    isBullish,
    isBearish,
    isHold: isNoTrade || (!isBullish && !isBearish),
    confidenceLevel: toFiniteNumber(analysis.fiso_score, 0),
  };
}

function getCache<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL) return undefined;
    if (parsed.data?.error || parsed.data?.detail) return undefined;
    if (
      parsed.data &&
      typeof parsed.data === 'object' &&
      !Array.isArray(parsed.data) &&
      Object.keys(parsed.data).length === 0
    ) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

function setCache(key: string, data: any) {
  if (typeof window === 'undefined' || !data || data.error || data.detail) return;
  if (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

let supabaseClientPromise: Promise<any> | null = null;

async function getSharedSupabaseClient(supabaseUrl: string, supabaseKey: string) {
  if (typeof window === 'undefined') return null;
  const globalKey = '__bullseyeSupabaseClient';
  const browserWindow = window as any;
  if (browserWindow[globalKey]) return browserWindow[globalKey];
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      if (!browserWindow[globalKey]) {
        browserWindow[globalKey] = createClient(supabaseUrl, supabaseKey);
      }
      return browserWindow[globalKey];
    });
  }
  return supabaseClientPromise;
}

function getChartCandles(chartData: any) {
  if (!Array.isArray(chartData)) return [];
  return chartData
    .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
    .map((d: any) => ({ ...d, day: d.date.toString().slice(0, 10) }))
    .sort((a: any, b: any) => a.day.localeCompare(b.day));
}

type IndicatorPoint = {
  label: string;
  value: number;
};

type IndicatorPanelData = {
  name: string;
  color: string;
  latest: string;
  series: IndicatorPoint[];
};

type AlertRecord = {
  id: string;
  ticker: string;
  prompt: string;
  rule?: { description?: string };
  channels?: string[];
  status: 'active' | 'paused';
  email?: string | null;
  last_checked_at?: string | null;
  last_triggered_at?: string | null;
  created_at?: string | null;
};

type NotificationPreference = {
  email?: string | null;
  daily_stock_email_enabled: boolean;
  market: 'NSE' | 'BSE' | 'US';
  risk_level: 'Conservative' | 'Balanced' | 'Aggressive';
  email_time: string;
  signal_type: 'Next-day swing' | 'Intraday' | 'Both';
  consent_version?: string | null;
  consent_accepted_at?: string | null;
  unsubscribed_at?: string | null;
};

type DailySignalRecord = {
  id?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entry_low: number;
  entry_high: number;
  target_price: number;
  stop_loss: number;
  confidence: number;
  risk_reward: number;
  explanation_json?: { reasons?: string[] };
};

type InstantSignalDeliveryMode = 'today' | 'next_day';

const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = {
  email: null,
  daily_stock_email_enabled: false,
  market: 'NSE',
  risk_level: 'Balanced',
  email_time: '18:00',
  signal_type: 'Next-day swing',
  consent_version: null,
  consent_accepted_at: null,
  unsubscribed_at: null,
};

function normalizeNotificationTimeValue(value?: string | null) {
  if (!value) return DEFAULT_NOTIFICATION_PREFERENCE.email_time;
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  return DEFAULT_NOTIFICATION_PREFERENCE.email_time;
}

function getFriendlyErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
  try {
    const parsed = JSON.parse(message);
    if (parsed?.message) return String(parsed.message);
  } catch {}
  return message || fallback;
}

function getMinimumNotificationTime(market: NotificationPreference['market']) {
  return market === 'US' ? '16:30' : '16:00';
}

function isNotificationTimeValid(market: NotificationPreference['market'], value?: string | null) {
  const normalized = normalizeNotificationTimeValue(value);
  return normalized >= getMinimumNotificationTime(market);
}

function getSafeNotificationTime(market: NotificationPreference['market'], value?: string | null) {
  const normalized = normalizeNotificationTimeValue(value);
  return isNotificationTimeValid(market, normalized) ? normalized : DEFAULT_NOTIFICATION_PREFERENCE.email_time;
}

function NotificationSettingsModal({
  open,
  userEmail,
  preference,
  previewSignals,
  isSaving,
  error,
  message,
  showConsent,
  onClose,
  onChange,
  onSave,
  onSendNow,
  onToggle,
  onConfirmConsent,
  onCancelConsent,
}: {
  open: boolean;
  userEmail?: string | null;
  preference: NotificationPreference;
  previewSignals: DailySignalRecord[];
  isSaving: boolean;
  error: string;
  message: string;
  showConsent: boolean;
  onClose: () => void;
  onChange: (patch: Partial<NotificationPreference>) => void;
  onSave: () => void;
  onSendNow: (deliveryMode: InstantSignalDeliveryMode) => void;
  onToggle: (enabled: boolean) => void;
  onConfirmConsent: () => void;
  onCancelConsent: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[71] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
        <div
          className="my-4 w-full max-w-3xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_rgba(15,23,42,0.5)]"
          onKeyDown={event => {
            if (
              showConsent ||
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.ctrlKey ||
              event.altKey ||
              event.metaKey ||
              event.target instanceof HTMLButtonElement ||
              event.target instanceof HTMLSelectElement
            ) {
              return;
            }
            event.preventDefault();
            onSendNow('next_day');
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300 font-['Space_Grotesk']">Logged-in Alerts</div>
              <h2 className="mt-2 text-2xl font-black font-['Space_Grotesk']">Daily 10 Stock Signals Email</h2>
              <p className="mt-2 text-sm text-slate-400 font-['JetBrains_Mono']">
                {userEmail || 'Your signed-in account'} can receive a model-ranked 10-stock email for the next trading day after the Indian market closes.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-10 w-10 rounded-2xl border border-white/10 text-slate-400 transition hover:border-cyan-300/40 hover:text-white"
              aria-label="Close notification settings"
            >
              X
            </button>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onSendNow('today')}
                  disabled={isSaving}
                  className="flex min-h-[124px] flex-col justify-between rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-4 text-left transition hover:border-amber-300/45 hover:bg-amber-400/14 disabled:opacity-60"
                >
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.16em] text-white font-['Space_Grotesk']">
                      Today&apos;s Stocks
                    </div>
                    <div className="mt-2 text-[11px] text-slate-300 font-['JetBrains_Mono']">
                      Send a same-day intraday 10-stock email before market close using the latest available data.
                    </div>
                  </div>
                  <div className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300 font-['Space_Grotesk']">
                    {isSaving ? 'Sending...' : 'Send Today'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onSendNow('next_day')}
                  disabled={isSaving}
                  className="flex min-h-[116px] flex-col justify-between rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-4 text-left transition hover:border-emerald-300/45 hover:bg-emerald-400/14 disabled:opacity-60"
                >
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.16em] text-white font-['Space_Grotesk']">
                      Next-Day Stocks
                    </div>
                    <div className="mt-2 text-[11px] text-slate-300 font-['JetBrains_Mono']">
                      Send the next trading day&apos;s ranked 10-stock email to your signed-in account right now.
                    </div>
                  </div>
                  <div className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 font-['Space_Grotesk']">
                    {isSaving ? 'Sending...' : 'Send Next Day'}
                  </div>
                </button>

                <label className="flex min-h-[116px] items-center justify-between rounded-2xl border border-cyan-300/25 bg-cyan-400/5 px-4 py-4 sm:col-span-2">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.16em] text-white font-['Space_Grotesk']">
                      Daily Automatic Alert
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400 font-['JetBrains_Mono']">
                      Turn this on once and Bullseye will automatically email your next-trading-day top 10 signals on each trading day.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preference.daily_stock_email_enabled}
                    onChange={event => onToggle(event.target.checked)}
                    disabled={isSaving}
                    className="h-5 w-5 accent-cyan-400"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 font-['Space_Grotesk']">Market</span>
                  <select
                    value={preference.market}
                    onChange={event => onChange({ market: event.target.value as NotificationPreference['market'] })}
                    className="h-12 rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition focus:border-cyan-400 font-['JetBrains_Mono']"
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                    <option value="US">US</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 font-['Space_Grotesk']">Risk Level</span>
                  <select
                    value={preference.risk_level}
                    onChange={event => onChange({ risk_level: event.target.value as NotificationPreference['risk_level'] })}
                    className="h-12 rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition focus:border-cyan-400 font-['JetBrains_Mono']"
                  >
                    <option value="Conservative">Conservative</option>
                    <option value="Balanced">Balanced</option>
                    <option value="Aggressive">Aggressive</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 font-['Space_Grotesk']">Preferred Email Time</span>
                  <input
                    type="time"
                    value={preference.email_time}
                    onChange={event => onChange({ email_time: event.target.value })}
                    min={getMinimumNotificationTime(preference.market)}
                    className="h-12 rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition focus:border-cyan-400 font-['JetBrains_Mono']"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 font-['Space_Grotesk']">Signal Type</span>
                  <select
                    value={preference.signal_type}
                    onChange={event => onChange({ signal_type: event.target.value as NotificationPreference['signal_type'] })}
                    className="h-12 rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition focus:border-cyan-400 font-['JetBrains_Mono']"
                  >
                    <option value="Next-day swing">Next-day swing</option>
                    <option value="Intraday">Intraday</option>
                    <option value="Both">Both</option>
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300 font-['Space_Grotesk']">Delivery Rules</div>
                <div className="mt-2 text-[11px] leading-6 text-slate-300 font-['JetBrains_Mono']">
                  Your preferred time must be after the Indian market closes. When this is enabled, Bullseye will generate and send next-trading-day ranked signals automatically on trading days.
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs text-red-200 font-['JetBrains_Mono']">
                  {error}
                </div>
              )}
              {message && (
                <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100 font-['JetBrains_Mono']">
                  {message}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaving}
                  className="force-light-text rounded-2xl bg-cyan-400 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50 font-['Space_Grotesk']"
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 font-['Space_Grotesk']"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300 font-['Space_Grotesk']">Email Preview</div>
              <div className="mt-2 text-[11px] text-slate-400 font-['JetBrains_Mono']">
                The top model-ranked stocks for the next trading day are sent, each with a confidence score. Fewer are sent — or none — when the market is weak and few names clear the quality bar.
              </div>
              <div className="mt-4 space-y-3">
                {previewSignals.length > 0 ? previewSignals.slice(0, 4).map(signal => (
                  <div key={signal.symbol} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black text-white font-['Space_Grotesk']">{signal.symbol}</div>
                      <div className={`text-[10px] font-black uppercase tracking-[0.18em] font-['Space_Grotesk'] ${signal.direction === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {signal.direction}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-300 font-['JetBrains_Mono']">
                      Entry {signal.entry_low.toFixed(2)}-{signal.entry_high.toFixed(2)} | Target {signal.target_price.toFixed(2)} | Stop Loss {signal.stop_loss.toFixed(2)}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] font-['JetBrains_Mono']">
                      <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-black uppercase tracking-[0.14em] text-cyan-300">
                        Confidence {Math.round((signal.confidence ?? 0) * 100)}%
                      </span>
                      {typeof signal.risk_reward === 'number' && (
                        <span className="text-slate-400">R:R {signal.risk_reward.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 font-['JetBrains_Mono']">
                      {(signal.explanation_json?.reasons ?? []).slice(0, 2).join(' | ') || 'Model-ranked technical setup'}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-[11px] text-slate-400 font-['JetBrains_Mono']">
                    The latest next-trading-day signal preview will appear here after the prediction engine runs.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showConsent && (
        <>
          <div className="fixed inset-0 z-[72] bg-slate-950/80" />
          <div className="fixed inset-0 z-[73] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
            <div className="my-4 w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-[0_28px_90px_rgba(15,23,42,0.5)] sm:p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300 font-['Space_Grotesk']">Consent Required</div>
              <h3 className="mt-3 text-2xl font-black font-['Space_Grotesk']">Before turning this on</h3>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300 font-['JetBrains_Mono']">
                <p>Signals are model-generated analysis.</p>
                <p>Returns are not guaranteed.</p>
                <p>Past performance does not guarantee future results.</p>
                <p>You can disable or unsubscribe at any time.</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onConfirmConsent}
                  className="force-light-text rounded-2xl bg-cyan-400 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-300 font-['Space_Grotesk']"
                >
                  I Understand, Enable
                </button>
                <button
                  type="button"
                  onClick={onCancelConsent}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:border-cyan-300/40 font-['Space_Grotesk']"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const INDICATOR_NAMES = [
  '52 Week High/Low',
  'Accelerator Oscillator',
  'Accumulation/Distribution',
  'Accumulative Swing Index',
  'Advance/Decline',
  'Arnaud Legoux Moving Average',
  'Aroon',
  'Average Directional Index',
  'Average Price',
  'Average True Range',
  'Awesome Oscillator',
  'Balance of Power',
  'Bollinger Bands',
  'Bollinger Bands %B',
  'Bollinger Bands Width',
  'Chaikin Money Flow',
  'Chaikin Oscillator',
  'Chaikin Volatility',
  'Chande Kroll Stop',
  'Chande Momentum Oscillator',
  'Chop Zone',
  'Choppiness Index',
  'Commodity Channel Index',
  'Connors RSI',
  'Coppock Curve',
  'Correlation - Log',
  'Correlation Coefficient',
  'Detrended Price Oscillator',
  'Directional Movement',
  'Donchian Channels',
  'Double EMA',
  'Ease Of Movement',
  "Elder's Force Index",
  'EMA Cross',
  'Envelopes',
  'Fisher Transform',
  'Guppy Multiple Moving Average',
  'Historical Volatility',
  'Hull Moving Average',
  'Ichimoku Cloud',
  'Keltner Channels',
  'Klinger Oscillator',
  'Know Sure Thing',
  'Least Squares Moving Average',
  'Linear Regression Curve',
  'Linear Regression Slope',
  'MA Cross',
  'MA with EMA Cross',
  'MACD',
  'Majority Rule',
  'Mass Index',
  'McGinley Dynamic',
  'Median Price',
  'Momentum',
  'Money Flow Index',
  'Moving Average',
  'Moving Average Adaptive',
  'Moving Average Channel',
  'Moving Average Double',
  'Moving Average Exponential',
  'Moving Average Hamming',
  'Moving Average Multiple',
  'Moving Average Triple',
  'Moving Average Weighted',
  'Net Volume',
  'On Balance Volume',
  'Parabolic SAR',
  'Pivot Points Standard',
  'Price Channel',
  'Price Oscillator',
  'Price Volume Trend',
  'Rank Correlation Index',
  'Rate Of Change',
  'Ratio',
  'Relative Strength Index',
  'Relative Vigor Index',
  'Relative Volatility Index',
  'SMI Ergodic Indicator/Oscillator',
  'Smoothed Moving Average',
  'Spread',
  'Standard Deviation',
  'Standard Error',
  'Standard Error Bands',
  'Stochastic',
  'Stochastic RSI',
  'SuperTrend',
  'Trend Strength Index',
  'Triple EMA',
  'TRIX',
  'True Strength Index',
  'Typical Price',
  'Ultimate Oscillator',
  'Volatility Close-to-Close',
  'Volatility Index',
  'Volatility O-H-L-C',
  'Volatility Zero Trend Close-to-Close',
  'Volume',
  'Volume Oscillator',
  'Volume Profile Fixed Range',
  'Volume Profile Visible Range',
  'Vortex Indicator',
  'VWAP',
  'VWMA',
  'Williams %R',
  'Williams Alligator',
  'Williams Fractal',
  'Zig Zag',
];

const STOCKS_PER_PAGE = 24;
const STOCK_PAGE_LIMIT = 100;
// Only this many top cards are analyzed eagerly on load; the rest analyze lazily
// as they scroll into view, so the homepage no longer fires ~24 heavy analyses
// up front (the main cause of the slow first paint).
const FEATURED_ANALYSIS_COUNT = 6;
const MARKET_SHUFFLE_VERSION = 'sector-mix-v1';

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableMarketShuffle<T extends { ticker: string }>(stocks: T[], salt: string) {
  return [...stocks].sort((left, right) => {
    const leftHash = stableHash(`${salt}:${left.ticker}`);
    const rightHash = stableHash(`${salt}:${right.ticker}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return left.ticker.localeCompare(right.ticker);
  });
}

function asNumber(value: any, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rollingMean(values: number[], period: number) {
  return values.map((_, index) => mean(values.slice(Math.max(0, index - period + 1), index + 1)));
}

function rollingMin(values: number[], period: number) {
  return values.map((_, index) => Math.min(...values.slice(Math.max(0, index - period + 1), index + 1)));
}

function rollingMax(values: number[], period: number) {
  return values.map((_, index) => Math.max(...values.slice(Math.max(0, index - period + 1), index + 1)));
}

function rollingStd(values: number[], period: number) {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - period + 1), index + 1);
    const avg = mean(slice);
    return Math.sqrt(mean(slice.map(value => (value - avg) ** 2)));
  });
}

function ema(values: number[], period: number) {
  const smoothing = 2 / (period + 1);
  const result: number[] = [];
  values.forEach((value, index) => {
    result[index] = index === 0 ? value : value * smoothing + result[index - 1] * (1 - smoothing);
  });
  return result;
}

function rsi(values: number[], period = 14) {
  return values.map((value, index) => {
    if (index === 0) return 50;
    const slice = values.slice(Math.max(1, index - period + 1), index + 1);
    let gains = 0;
    let losses = 0;
    slice.forEach((item, sliceIndex) => {
      const previous = values[Math.max(0, index - slice.length + sliceIndex)];
      const diff = item - previous;
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    });
    if (losses === 0) return gains === 0 ? 50 : 100;
    return 100 - 100 / (1 + gains / losses);
  });
}

function formatIndicatorValue(value: number, name: string) {
  if (!Number.isFinite(value)) return '-';
  if (/rsi|stochastic|williams|volatility|percent|%|index|money flow|aroon|chop/i.test(name)) {
    return `${value.toFixed(2)}%`;
  }
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return value.toFixed(2);
}

function getIndicatorColor(name: string) {
  if (/macd|momentum|oscillator|rate|trix|tsi/i.test(name)) return '#38bdf8';
  if (/volume|money|accumulation|vwap/i.test(name)) return '#22c55e';
  if (/volatility|atr|deviation|error|band/i.test(name)) return '#f59e0b';
  if (/rsi|stochastic|williams|cci|aroon/i.test(name)) return '#a78bfa';
  return '#06b6d4';
}

function buildIndicatorPanel(name: string, chartData: any): IndicatorPanelData | null {
  const candles = getChartCandles(chartData);
  if (candles.length < 2) return null;

  const close = candles.map((c: any) => asNumber(c.close));
  const open = candles.map((c: any) => asNumber(c.open));
  const high = candles.map((c: any) => asNumber(c.high));
  const low = candles.map((c: any) => asNumber(c.low));
  const volume = candles.map((c: any) => asNumber(c.volume));
  const typical = close.map((value, index) => (high[index] + low[index] + value) / 3);
  const lowerName = name.toLowerCase();
  const range = high.map((value, index) => Math.max(value - low[index], 0.0001));
  const trueRange = close.map((value, index) => {
    if (index === 0) return range[index];
    return Math.max(high[index] - low[index], Math.abs(high[index] - close[index - 1]), Math.abs(low[index] - close[index - 1]));
  });
  const atr = rollingMean(trueRange, 14);
  const ma20 = rollingMean(close, 20);
  const ma50 = rollingMean(close, 50);
  const ema12 = ema(close, 12);
  const ema26 = ema(close, 26);
  const std20 = rollingStd(close, 20);
  const high20 = rollingMax(high, 20);
  const low20 = rollingMin(low, 20);
  let values: number[];

  if (lowerName.includes('macd')) {
    values = close.map((_, index) => ema12[index] - ema26[index]);
  } else if (lowerName.includes('relative strength index') || lowerName.includes('connors rsi') || lowerName.includes('stochastic rsi')) {
    values = rsi(close, lowerName.includes('connors') ? 3 : 14);
  } else if (lowerName.includes('stochastic')) {
    values = close.map((value, index) => ((value - low20[index]) / Math.max(high20[index] - low20[index], 0.0001)) * 100);
  } else if (lowerName.includes('williams')) {
    values = close.map((value, index) => ((high20[index] - value) / Math.max(high20[index] - low20[index], 0.0001)) * -100);
  } else if (lowerName.includes('money flow') || lowerName.includes('chaikin money')) {
    values = close.map((_, index) => {
      const start = Math.max(0, index - 19);
      let mfv = 0;
      let vol = 0;
      for (let i = start; i <= index; i += 1) {
        const multiplier = ((close[i] - low[i]) - (high[i] - close[i])) / Math.max(high[i] - low[i], 0.0001);
        mfv += multiplier * volume[i];
        vol += volume[i];
      }
      return vol ? (mfv / vol) * 100 : 0;
    });
  } else if (lowerName.includes('accumulation') || lowerName.includes('on balance') || lowerName.includes('price volume') || lowerName.includes('net volume')) {
    let cumulative = 0;
    values = close.map((value, index) => {
      if (index === 0) return 0;
      const direction = value > close[index - 1] ? 1 : value < close[index - 1] ? -1 : 0;
      cumulative += direction * volume[index];
      return cumulative;
    });
  } else if (lowerName.includes('average true range') || lowerName.includes('atr')) {
    values = atr;
  } else if (lowerName.includes('bollinger') || lowerName.includes('standard error bands')) {
    values = close.map((value, index) => ((value - (ma20[index] - 2 * std20[index])) / Math.max(4 * std20[index], 0.0001)) * 100);
  } else if (lowerName.includes('donchian') || lowerName.includes('price channel') || lowerName.includes('52 week')) {
    values = close.map((value, index) => ((value - low20[index]) / Math.max(high20[index] - low20[index], 0.0001)) * 100);
  } else if (lowerName.includes('aroon')) {
    values = close.map((_, index) => {
      const start = Math.max(0, index - 24);
      const highs = high.slice(start, index + 1);
      const lows = low.slice(start, index + 1);
      const highAge = highs.length - 1 - highs.lastIndexOf(Math.max(...highs));
      const lowAge = lows.length - 1 - lows.lastIndexOf(Math.min(...lows));
      return ((25 - highAge) / 25) * 100 - ((25 - lowAge) / 25) * 100;
    });
  } else if (lowerName.includes('commodity channel') || lowerName.includes('cci')) {
    const avgTypical = rollingMean(typical, 20);
    values = typical.map((value, index) => {
      const start = Math.max(0, index - 19);
      const deviation = mean(typical.slice(start, index + 1).map(item => Math.abs(item - avgTypical[index])));
      return (value - avgTypical[index]) / Math.max(0.015 * deviation, 0.0001);
    });
  } else if (lowerName.includes('vwap') || lowerName.includes('vwma') || lowerName.includes('volume weighted')) {
    let pv = 0;
    let vol = 0;
    values = close.map((value, index) => {
      pv += typical[index] * volume[index];
      vol += volume[index];
      return vol ? pv / vol : value;
    });
  } else if (lowerName.includes('volume')) {
    values = volume;
  } else if (lowerName.includes('volatility') || lowerName.includes('standard deviation') || lowerName.includes('standard error')) {
    values = close.map((value, index) => (rollingStd(close.slice(0, index + 1), 20).at(-1) || 0) / Math.max(value, 0.0001) * 100);
  } else if (lowerName.includes('momentum') || lowerName.includes('rate of change') || lowerName.includes('roc')) {
    values = close.map((value, index) => index < 10 ? 0 : ((value - close[index - 10]) / Math.max(close[index - 10], 0.0001)) * 100);
  } else if (lowerName.includes('moving average') || lowerName.includes('ema') || lowerName.includes('ma cross') || lowerName.includes('alligator') || lowerName.includes('mcginley')) {
    values = lowerName.includes('exponential') || lowerName.includes('ema') ? ema(close, 20) : ma20;
  } else if (lowerName.includes('supertrend') || lowerName.includes('parabolic') || lowerName.includes('keltner') || lowerName.includes('chande kroll')) {
    values = close.map((value, index) => value >= ma20[index] ? value - 2 * atr[index] : value + 2 * atr[index]);
  } else if (lowerName.includes('median')) {
    values = high.map((value, index) => (value + low[index]) / 2);
  } else if (lowerName.includes('typical') || lowerName.includes('average price')) {
    values = typical;
  } else if (lowerName.includes('balance of power')) {
    values = close.map((value, index) => ((value - open[index]) / range[index]) * 100);
  } else if (lowerName.includes('directional') || lowerName.includes('trend strength')) {
    values = close.map((value, index) => ((ma20[index] - ma50[index]) / Math.max(value, 0.0001)) * 100);
  } else {
    values = close.map((value, index) => index === 0 ? 0 : ((value - close[index - 1]) / Math.max(close[index - 1], 0.0001)) * 100);
  }

  const cleanValues = values.map(value => Number.isFinite(value) ? value : 0);
  const series = cleanValues.map((value, index) => ({ label: candles[index].day, value })).slice(-120);
  const latest = series.at(-1)?.value ?? 0;
  return {
    name,
    color: getIndicatorColor(name),
    latest: formatIndicatorValue(latest, name),
    series,
  };
}

function buildSvgPath(series: IndicatorPoint[], width = 720, height = 150) {
  if (series.length < 2) return '';
  const values = series.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  return series
    .map((point, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * width;
      const y = height - ((point.value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

const IndicatorPanel = ({ panel }: { panel: IndicatorPanelData }) => {
  const path = buildSvgPath(panel.series);
  return (
    <div className="relative border-t border-slate-200 bg-white">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 text-xs font-bold text-slate-700 font-['Space_Grotesk']">
        <span>{panel.name}</span>
        <span className="font-['JetBrains_Mono']" style={{ color: panel.color }}>{panel.latest}</span>
      </div>
      <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-md px-2 py-1 text-xs font-black text-white font-['JetBrains_Mono']" style={{ backgroundColor: panel.color }}>
        {panel.latest}
      </div>
      <svg viewBox="0 0 720 150" className="h-[190px] w-full" preserveAspectRatio="none" role="img" aria-label={`${panel.name} indicator chart`}>
        {Array.from({ length: 6 }, (_, index) => (
          <line key={`h-${index}`} x1="0" x2="720" y1={index * 30} y2={index * 30} stroke="rgba(15,23,42,0.06)" />
        ))}
        {Array.from({ length: 14 }, (_, index) => (
          <line key={`v-${index}`} x1={index * 55.4} x2={index * 55.4} y1="0" y2="150" stroke="rgba(15,23,42,0.05)" />
        ))}
        <path d={path} fill="none" stroke={panel.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

const IndicatorChartPane = ({
  panel,
  setPaneRef,
}: {
  panel: IndicatorPanelData;
  setPaneRef: (name: string, element: HTMLDivElement | null) => void;
}) => (
  <div className="relative border-t border-slate-200 bg-white">
    <div className="absolute left-3 top-3 z-10 flex items-center gap-2 text-xs font-bold text-slate-700 font-['Space_Grotesk']">
      <span>{panel.name}</span>
      <span className="font-['JetBrains_Mono']" style={{ color: panel.color }}>{panel.latest}</span>
    </div>
    <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-md px-2 py-1 text-xs font-black text-white font-['JetBrains_Mono']" style={{ backgroundColor: panel.color }}>
      {panel.latest}
    </div>
    <div
      ref={(element) => setPaneRef(panel.name, element)}
      className="h-[190px] w-full"
      aria-label={`${panel.name} synced indicator chart`}
    />
  </div>
);

function buildPreviewChartPath(chartData: any, width = 720, height = 190) {
  const candles = getChartCandles(chartData).slice(-90);
  if (candles.length < 2) return '';
  const values = candles.map((c: any) => asNumber(c.close));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function isEnglishNewsTitle(title: string) {
  const normalized = title.normalize('NFKD');
  const letters = normalized.match(/\p{L}/gu) ?? [];
  if (!letters.length) return true;
  const englishLetters = normalized.match(/[A-Za-z]/g) ?? [];
  return englishLetters.length / letters.length >= 0.85;
}

function splitNewsHeadline(headline: string) {
  const parts = String(headline).split(/\s(?:—|â€”)\s/);
  return {
    title: parts[0]?.trim() || String(headline),
    source: parts.slice(1).join(' - ').trim(),
  };
}

function storyFromHeadline(headline: string): NewsStory {
  const { title, source } = splitNewsHeadline(headline);
  return { title, source };
}

function buildMarketNewsRead(title: string) {
  const lower = title.toLowerCase();
  if (/\b(rate|inflation|fed|rbi|bond|yield|oil|dollar)\b/.test(lower)) {
    return 'Macro driver that can affect risk appetite and market breadth.';
  }
  if (/\b(earnings|profit|results|revenue|guidance)\b/.test(lower)) {
    return 'Earnings flow that can shift sector leadership and stock selection.';
  }
  if (/\b(nifty|sensex|nasdaq|s&p|dow|market)\b/.test(lower)) {
    return 'Broad index context to compare against individual stock setups.';
  }
  return 'Market context item to review before acting on individual signals.';
}

function getLevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr: number[][] = [];
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = i === 0
        ? j
        : Math.min(
            arr[i - 1][j] + 1,
            arr[i][j - 1] + 1,
            arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
          );
    }
  }
  return arr[t.length][s.length];
}

function buildMarketAnswer(prompt: string, analysis: any, ticker: string, currency: string, chartData: any) {
  const clean = prompt.toLowerCase();
  const candles = getChartCandles(chartData);
  const latest = candles[candles.length - 1];
  const recent = candles.slice(-20);
  const previous = candles[candles.length - 2];
  const wantsNowPrice = /\b(current|now|today|latest|live).*\b(price|close|value)\b|\b(price|close|value).*\b(current|now|today|latest|live)\b/i.test(prompt);
  const wantsPrediction = /\b(should i buy|buy or sell|prediction|target|stop loss|forecast|verdict|recommend)\b/i.test(prompt);
  const wantsTrend = /\b(trend|momentum|bullish|bearish|uptrend|downtrend|moving average|ma|strong|weak)\b/i.test(prompt);
  const wantsRisk = /\b(risk|risky|stop|stoploss|stop loss|downside|upside|reward|target)\b/i.test(prompt);
  const wantsLevels = /\b(support|resistance|range|breakout|break down|breakdown|level)\b/i.test(prompt);
  const analysisView = getAnalysisPresentation(analysis);

  if (wantsNowPrice && latest) {
    return {
      type: 'assistant_answer',
      title: 'Latest loaded price',
      answer: `${ticker} last loaded close is ${currency}${Number(latest.close).toLocaleString(undefined, { maximumFractionDigits: 2 })} from ${latest.day}.`,
      rows: [
        ['Open', latest.open],
        ['High', latest.high],
        ['Low', latest.low],
        ['Close', latest.close],
      ],
    };
  }

  if (wantsPrediction && analysisView) {
    return {
      type: 'assistant_answer',
      title: 'Bullseye read',
      answer: `${ticker} is currently marked ${analysisView.displayVerdict}. Entry is ${currency}${analysisView.entry}, target is ${currency}${analysisView.target}, stop loss is ${currency}${analysisView.stop_loss}, and the FISO confidence level is ${analysisView.confidenceLevel}/100.`,
      rows: [
        ['FISO confidence level', analysisView.confidenceLevel],
        ['Estimated days', analysisView.estimated_days],
        ['Target date', analysisView.target_date],
        ['Best strategy', STRATEGY_NAMES[analysisView.best_strategy_id] ?? `Strategy ${analysisView.best_strategy_id}`],
      ],
    };
  }

  if ((wantsTrend || wantsLevels) && latest && recent.length >= 5) {
    const closes = recent.map((candle: any) => Number(candle.close)).filter(Number.isFinite);
    const highs = recent.map((candle: any) => Number(candle.high)).filter(Number.isFinite);
    const lows = recent.map((candle: any) => Number(candle.low)).filter(Number.isFinite);
    const high20 = Math.max(...highs);
    const low20 = Math.min(...lows);
    const startClose = closes[0];
    const endClose = closes[closes.length - 1];
    const changePct = startClose ? ((endClose - startClose) / startClose) * 100 : 0;
    const direction = changePct > 2 ? 'positive' : changePct < -2 ? 'weak' : 'sideways';

    return {
      type: 'assistant_answer',
      title: wantsLevels ? 'Support and resistance' : 'Trend read',
      answer: `${ticker} looks ${direction} over the last ${recent.length} loaded candles. The recent range is ${currency}${low20.toLocaleString(undefined, { maximumFractionDigits: 2 })} to ${currency}${high20.toLocaleString(undefined, { maximumFractionDigits: 2 })}, with a ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% close-to-close move.`,
      rows: [
        ['Latest close', latest.close],
        ['20-candle support', low20],
        ['20-candle resistance', high20],
        ['20-candle move', `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`],
      ],
    };
  }

  if (wantsRisk && analysisView && latest) {
    const entry = Number(analysisView.entry || latest.close);
    const target = Number(analysisView.target);
    const stop = Number(analysisView.stop_loss);
    const upside = entry ? ((target - entry) / entry) * 100 : 0;
    const downside = entry ? ((entry - stop) / entry) * 100 : 0;

    return {
      type: 'assistant_answer',
      title: 'Risk and reward',
      answer: `${ticker} setup has about ${upside.toFixed(2)}% target room versus ${downside.toFixed(2)}% stop-loss risk from the model entry. Treat this as research, not financial advice.`,
      rows: [
        ['Entry', entry],
        ['Target', target],
        ['Stop loss', stop],
        ['Reward/risk', downside > 0 ? (upside / downside).toFixed(2) : '-'],
      ],
    };
  }

  if (/\b(yesterday|previous|last session|last candle)\b/i.test(clean) && previous) {
    const move = Number(previous.close) ? ((Number(latest.close) - Number(previous.close)) / Number(previous.close)) * 100 : 0;
    return {
      type: 'assistant_answer',
      title: 'Previous session comparison',
      answer: `${ticker} moved ${move >= 0 ? '+' : ''}${move.toFixed(2)}% from ${previous.day} close to ${latest.day} close.`,
      rows: [
        ['Previous close', previous.close],
        ['Latest close', latest.close],
        ['Change', `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`],
        ['Latest date', latest.day],
      ],
    };
  }

  if (/\b(help|what can you do|examples?)\b/i.test(clean)) {
    return {
      type: 'assistant_answer',
      title: 'AI search is ready',
      answer: 'Ask for a dated price, current loaded price, holding profit/loss, buy/sell read, or a custom backtest strategy.',
      rows: [
        ['Example', 'If I buy Friday closing price and sell Monday opening price, test it'],
        ['Example', 'Bought 1000 shares 60 days ago profit or loss'],
        ['Example', 'Opening price on 12 Feb 2025'],
        ['Example', 'Backtest RSI crosses above 30 and sell above 70'],
      ],
    };
  }

  return null;
}

function resolveMarket(exchange: string): MarketScope {
  return exchange === 'NASDAQ' || exchange === 'NYSE' ? 'US' : 'INDIA';
}

function isIndianStock(stock?: typeof STOCKS[number] | null) {
  return !!stock && resolveMarket(stock.exchange) === 'INDIA';
}

function canShowDetailedAnalysis(stock?: typeof STOCKS[number] | null) {
  return !!stock && (resolveMarket(stock.exchange) === 'INDIA' || resolveMarket(stock.exchange) === 'US');
}

function formatFaceValue(stock?: typeof STOCKS[number] | null, fallback?: any) {
  const value = Number(fallback ?? stock?.faceValue);
  if (!Number.isFinite(value)) return '-';
  const currency = stock?.currency ?? '';
  return `${currency}${formatIndianNumber(value, value < 1 ? 4 : 2)}`;
}

function formatIndianNumber(value: any, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: numeric % 1 === 0 ? 0 : Math.min(digits, 2),
  }).format(numeric);
}

function formatCurrencyNumber(value: any, currencySymbol: string, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${currencySymbol}${formatIndianNumber(numeric, digits)}`;
}

function formatCompactRupees(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const absolute = Math.abs(numeric);
  if (absolute >= 10000000) return `${(numeric / 10000000).toFixed(2)} Cr`;
  if (absolute >= 100000) return `${(numeric / 100000).toFixed(2)} L`;
  return formatIndianNumber(numeric, 2);
}

function formatMarketCap(value: any, unit?: string, currencySymbol = '₹') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  if (unit === 'crore') return `${currencySymbol}${formatIndianNumber(numeric, 2)} Cr`;
  return `${currencySymbol}${formatCompactRupees(numeric)}`;
}

function formatRatioValue(value: any, kind?: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  if (kind === 'percent') return `${numeric.toFixed(2)}%`;
  return formatIndianNumber(numeric, 2);
}

function humanizeLabel(label: string) {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── TICKER TAPE ─────────────────────────────────────────────────────────────
type QuoteSnapshot = {
  price?: number | null;
  change_percent?: number;
};

const INDEX_TICKERS = [
  { title: 'NIFTY 50', symbol: '^NSEI', currency: '' },
  { title: 'SENSEX', symbol: '^BSESN', currency: '' },
  { title: 'NASDAQ', symbol: '^IXIC', currency: '' },
  { title: 'S&P 500', symbol: '^GSPC', currency: '' },
];

const INDEX_QUOTES_KEY = `/api/v1/quotes/batch?tickers=${INDEX_TICKERS.map(item => encodeURIComponent(item.symbol)).join(',')}`;

const TickerItem = ({ title, currency, quote }: { title: string; currency: string; quote?: QuoteSnapshot }) => {
  const price = Number(quote?.price);
  const changePercent = Number(quote?.change_percent ?? 0);
  return (
    <div className="flex items-center gap-4 shrink-0 px-8 border-r border-white/10">
      <span className="font-bold text-xs tracking-widest text-zinc-400 uppercase font-['Space_Grotesk']">{title}</span>
      {Number.isFinite(price) && price > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-['JetBrains_Mono'] text-white">{currency}{price.toLocaleString()}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${changePercent >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>            {changePercent >= 0 ? '▲' : '▼'}{Math.abs(changePercent).toFixed(2)}%
          </span>
        </div>
      ) : <span className="text-xs text-zinc-600 font-['JetBrains_Mono'] tracking-widest">SYNCING...</span>}
    </div>
  );
};

// ─── MARKET ASSET CARD ────────────────────────────────────────────────────────
const IndexTickerTape = () => {
  const [cachedQuotes, setCachedQuotes] = useState<Record<string, QuoteSnapshot> | undefined>(undefined);

  useEffect(() => {
    setCachedQuotes(getCache<Record<string, QuoteSnapshot>>('index-quotes'));
  }, []);

  const { data } = useSWR<Record<string, QuoteSnapshot>>(INDEX_QUOTES_KEY, fetcher, {
    fallbackData: cachedQuotes,
    refreshInterval: 60000,
    revalidateOnMount: !cachedQuotes,
    revalidateIfStale: !cachedQuotes,
    onSuccess: quotes => setCache('index-quotes', quotes),
  });

  const content = (
    <>
      {INDEX_TICKERS.map(item => (
        <TickerItem
          key={item.symbol}
          title={item.title}
          currency={item.currency}
          quote={data?.[item.symbol]}
        />
      ))}
    </>
  );

  return (
    <div className="flex w-[200%] sm:w-[150%] md:w-full">
      <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0">{content}</div>
      <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0">{content}</div>
    </div>
  );
};

const MarketAssetCard = ({
  stock,
  prefetchedAnalysis,
  quickQuote,
  onPreview,
  onAnalysisReady,
}: {
  stock: typeof STOCKS[0];
  prefetchedAnalysis?: any;
  quickQuote?: QuoteSnapshot;
  onPreview: (stock: typeof STOCKS[0]) => void;
  onAnalysisReady?: (ticker: string, analysis: any) => void;
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [shouldAnalyze, setShouldAnalyze] = useState(false);

  // Lazy analysis: featured cards arrive pre-analyzed via prefetchedAnalysis;
  // every other card only requests its analysis once it scrolls into view, so
  // the page paints prices immediately instead of blocking on a big batch.
  useEffect(() => {
    if (prefetchedAnalysis) return;
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldAnalyze(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setShouldAnalyze(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [prefetchedAnalysis]);

  useSWR(
    shouldAnalyze && !prefetchedAnalysis ? `/api/v1/analyze/${stock.ticker}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 1000 * 60 * 10,
      onSuccess: data => {
        if (!data || data.error) return;
        setCache(`analysis:${stock.ticker}`, data);
        onAnalysisReady?.(stock.ticker, data);
      },
    }
  );

  const analysisView = getAnalysisPresentation(prefetchedAnalysis);
  const isReady = !!analysisView;
  const quickPrice = Number(quickQuote?.price);
  const quickChange = Number(quickQuote?.change_percent ?? 0);

  const isBull = analysisView?.isBullish;
  const isHold = analysisView?.isHold;
  const verdictColor = isReady
    ? (isBull ? 'text-green-400' : isHold ? 'text-zinc-300' : 'text-red-400')
    : 'text-cyan-600';
  const verdictBadge = isReady ? analysisView.displayVerdict.replace('Strong ', '') : 'Analyzing';

  // Mini verdict dot shown even before hover when prefetch is done
  const dotColor = isReady
    ? (isBull ? 'bg-green-400' : isHold ? 'bg-zinc-400' : 'bg-red-400')
    : 'bg-cyan-400';
  const signalGradient = isReady
    ? (isBull ? 'from-emerald-400 to-cyan-400' : isHold ? 'from-slate-400 to-cyan-300' : 'from-rose-400 to-orange-300')
    : 'from-cyan-300 to-sky-300';

  return (
    <div
      ref={cardRef}
      data-market-card={stock.ticker}
      className={`relative w-full min-h-[164px] p-4 sm:p-5 border bg-white/85 backdrop-blur-md rounded-[22px] transition-all duration-300 group flex flex-col justify-start overflow-hidden select-none shadow-[0_18px_55px_rgba(15,23,42,0.08)] hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(8,145,178,0.16)]
        border-slate-200/80 hover:border-cyan-200`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${signalGradient}`} />
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-100/55 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex justify-between items-start gap-2 mb-5">
        <div className="min-w-0">
          <span className="block truncate text-[11px] font-black font-['JetBrains_Mono'] text-slate-500 transition-colors group-hover:text-cyan-600">{stock.symbol}</span>
          <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500 font-['JetBrains_Mono']">{stock.exchange}</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Live verdict dot — green/red/grey based on prefetch status */}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} title={isReady ? analysisView.displayVerdict : 'Running FISO analysis'} />
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); onPreview(stock); }}
            onClick={(e) => { e.stopPropagation(); onPreview(stock); }}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-cyan-600 hover:bg-cyan-50 hover:border-cyan-300 transition-all flex items-center justify-center shrink-0 shadow-sm"
            aria-label={`Open ${stock.symbol} preview`}
            title="Open preview"
          >
            <span className="text-xs transition-transform group-hover:-rotate-90">⌄</span>
          </button>
        </div>
      </div>
      <div className="relative font-black text-base text-slate-950 font-['Space_Grotesk'] leading-snug line-clamp-2 min-h-11">{stock.name}</div>

      <div className="relative mt-3 flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2 sm:px-3">
        <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-400 sm:text-[10px] sm:tracking-widest">Price</span>
        <span className="min-w-0 truncate text-right font-['JetBrains_Mono'] text-xs font-black text-slate-950 sm:text-sm">
          {Number.isFinite(quickPrice) && quickPrice > 0 ? `${stock.currency}${quickPrice.toLocaleString()}` : 'Fetching'}
        </span>
      </div>
      <div className="relative mt-2 flex min-w-0 items-center justify-between gap-2 px-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Face Value</span>
        <span className="text-[10px] font-black text-slate-600 font-['JetBrains_Mono']">{formatFaceValue(stock)}</span>
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${isReady ? analysisView.confidenceLevel : 28}%`,
              opacity: isReady ? 1 : 0.75,
              backgroundColor: isReady
                ? (isBull ? '#4ade80' : isHold ? '#71717a' : '#f87171')
                : '#22d3ee',
            }}
          />
        </div>
        <span className={`shrink-0 text-[9px] sm:text-[10px] font-black uppercase tracking-widest font-['Space_Grotesk'] ${verdictColor}`}>
          {verdictBadge}
        </span>
      </div>
    </div>
  );
};

const StockPreviewModal = ({
  stock,
  quickQuote,
  prefetchedAnalysis,
  onClose,
  onSelect,
  onAnalysisReady,
}: {
  stock: typeof STOCKS[0];
  quickQuote?: QuoteSnapshot;
  prefetchedAnalysis?: any;
  onClose: () => void;
  onSelect: (stock: typeof STOCKS[0]) => void;
  onAnalysisReady: (ticker: string, analysis: unknown) => void;
}) => {
  const exactPreviewChart = getCache(`chart:${stock.ticker}:1mo`);
  const fallbackPreviewChart =
    exactPreviewChart ??
    getCache(`chart:${stock.ticker}:1y`) ??
    getCache(`chart:${stock.ticker}:max`);
  const { data: fetchedAnalysis } = useSWR(
    !prefetchedAnalysis ? `/api/v1/analyze/${stock.ticker}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 1000 * 60 * 10,
      onSuccess: data => {
        if (!data || data.error) return;
        setCache(`analysis:${stock.ticker}`, data);
        onAnalysisReady(stock.ticker, data);
      },
    }
  );
  const { data: previewChart } = useSWR(`/api/v1/chart/${stock.ticker}?range=1mo`, fetcher, {
    fallbackData: fallbackPreviewChart,
    revalidateOnFocus: false,
    revalidateIfStale: !exactPreviewChart,
    revalidateOnMount: !exactPreviewChart,
    dedupingInterval: 1000 * 60 * 10,
    onSuccess: data => setCache(`chart:${stock.ticker}:1mo`, data),
  });

  const analysisView = getAnalysisPresentation(prefetchedAnalysis ?? fetchedAnalysis);
  const previewPath = buildPreviewChartPath(previewChart);
  const quickPrice = Number(quickQuote?.price);
  const quickChange = Number(quickQuote?.change_percent ?? 0);
  const isBull = analysisView?.isBullish;
  const isHold = analysisView?.isHold;
  const accentText = analysisView
    ? isBull ? 'text-green-400' : isHold ? 'text-slate-400' : 'text-red-400'
    : 'text-cyan-500';
  const accentBg = analysisView
    ? isBull ? 'from-emerald-400 to-cyan-300' : isHold ? 'from-slate-300 to-cyan-200' : 'from-rose-400 to-orange-300'
    : 'from-cyan-300 to-sky-300';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/35 p-5 backdrop-blur-md sm:p-6"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${stock.name} preview`}
    >
      <div
        className="relative my-4 flex max-h-[82vh] w-[min(88vw,72rem)] flex-col overflow-y-auto rounded-[24px] border border-cyan-200/70 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.35)] sm:max-h-[88vh] sm:min-h-[60vh] sm:w-full sm:rounded-[28px]"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className={`h-1.5 bg-gradient-to-r ${accentBg}`} />
        <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={onClose}
                className="mb-4 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:border-cyan-300 hover:bg-cyan-50 font-['Space_Grotesk']"
              >
                Back
              </button>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-600 font-['Space_Grotesk']">{stock.symbol} · {stock.exchange}</div>
              <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-5xl font-['Space_Grotesk']">{stock.name}</h2>
              <p className="mt-3 max-w-2xl text-xs leading-6 text-slate-500 font-['JetBrains_Mono'] sm:text-sm">
                Sneak peek of price action, FISO verdict, target zone, and stop-loss risk before opening the full dashboard.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-['Space_Grotesk']">Live Price</div>
              <div className="mt-1 text-2xl font-black text-slate-950 font-['JetBrains_Mono']">
                {Number.isFinite(quickPrice) && quickPrice > 0 ? `${stock.currency}${quickPrice.toLocaleString()}` : 'Fetching'}
              </div>
              <div className={`mt-1 text-xs font-black font-['JetBrains_Mono'] ${quickChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {quickChange >= 0 ? '+' : ''}{quickChange.toFixed(2)}%
              </div>
              <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Face Value <span className="text-slate-900 font-['JetBrains_Mono']">{formatFaceValue(stock)}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 font-['Space_Grotesk']">Mini Chart</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-['JetBrains_Mono']">1M preview</div>
              </div>
              <svg viewBox="0 0 720 230" className="h-44 w-full bg-white sm:h-64" preserveAspectRatio="none" role="img" aria-label={`${stock.name} mini chart`}>
                {Array.from({ length: 7 }, (_, index) => (
                  <line key={`h-${index}`} x1="0" x2="720" y1={index * 38} y2={index * 38} stroke="rgba(15,23,42,0.06)" />
                ))}
                {Array.from({ length: 13 }, (_, index) => (
                  <line key={`v-${index}`} x1={index * 60} x2={index * 60} y1="0" y2="230" stroke="rgba(15,23,42,0.05)" />
                ))}
                {previewPath ? (
                  <path d={previewPath} fill="none" stroke={isBull ? '#22c55e' : isHold ? '#06b6d4' : '#ef4444'} strokeWidth="3" vectorEffect="non-scaling-stroke" />
                ) : (
                  <text x="360" y="118" textAnchor="middle" className="fill-slate-400 text-xs font-bold uppercase tracking-widest">Loading chart</text>
                )}
              </svg>
            </div>

            <div className="grid gap-3">
              {analysisView ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-['Space_Grotesk']">Verdict</div>
                    <div className={`mt-2 text-3xl font-black uppercase tracking-widest ${accentText} font-['Space_Grotesk']`}>{analysisView.displayVerdict}</div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full bg-gradient-to-r ${accentBg}`} style={{ width: `${analysisView.confidenceLevel}%` }} />
                    </div>
                    <div className="mt-2 text-xs font-black text-white font-['JetBrains_Mono']">{analysisView.confidenceLevel}/100 FISO confidence</div>
                  </div>
                  {isHold ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">No Active Trade</div>
                      <div className="mt-2 text-sm font-black text-slate-700 font-['Space_Grotesk']">Target and stop are hidden until the setup becomes actionable.</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target</div>
                        <div className="mt-2 text-lg font-black text-green-500 font-['JetBrains_Mono']">{stock.currency}{analysisView.target}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stop Loss</div>
                        <div className="mt-2 text-lg font-black text-red-500 font-['JetBrains_Mono']">{stock.currency}{analysisView.stop_loss}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-52 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 font-['JetBrains_Mono']">Running analysis</div>
                  </div>
                </div>
              )}
              <a
                href={`/?ticker=${encodeURIComponent(stock.ticker)}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(stock);
                }}
                className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-xs font-black uppercase tracking-[0.2em] text-slate-950 transition-colors hover:bg-cyan-100 font-['Space_Grotesk']"
              >
                Open Full Analysis →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GlobalNewsPanel = () => {
  const { data } = useSWR<{ stories?: NewsStory[] }>('/api/v1/global-news', fetcher, {
    refreshInterval: 1000 * 60 * 10,
    revalidateOnFocus: false,
  });
  const stories = data?.stories?.length ? data.stories : [
    { title: 'Loading global market news and macro context...', source: 'Bullseye', url: null },
  ];

  return (
    <section className="global-news-panel rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_22px_70px_rgba(15,23,42,0.18)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
          <h2 className="global-news-heading text-xs font-black uppercase tracking-[0.22em] text-cyan-100 font-['Space_Grotesk']">Global Market News</h2>
        </div>
        <span className="global-news-pill rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-100 font-['JetBrains_Mono']">
          Live context
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        {stories.slice(0, 5).map((story, index) => (
          <article key={`${story.title}-${index}`} className="global-news-card rounded-2xl border border-white/10 bg-slate-950/70 p-4 transition-colors hover:border-cyan-300/35">
            <div className="global-news-source text-[9px] font-black uppercase tracking-widest text-cyan-300 font-['JetBrains_Mono']">{story.source}</div>
            {story.url ? (
              <a href={story.url} target="_blank" rel="noreferrer" className="global-news-title mt-2 block text-sm font-black leading-5 text-white transition hover:text-cyan-200 font-['Space_Grotesk']">
                {story.title}
              </a>
            ) : (
              <h3 className="global-news-title mt-2 text-sm font-black leading-5 text-white font-['Space_Grotesk']">{story.title}</h3>
            )}
            <p className="global-news-copy mt-3 text-[11px] leading-5 text-slate-300 font-['JetBrains_Mono']">{buildMarketNewsRead(story.title)}</p>
            {story.url && <div className="mt-3 text-[9px] font-black uppercase tracking-widest text-cyan-200/80 font-['JetBrains_Mono']">Open source</div>}
          </article>
        ))}
      </div>
    </section>
  );
};

// ─── DETAILED FISO PANEL ──────────────────────────────────────────────────────
const FisoDetailPanel = ({
  analysis,
  currency,
  ticker,
  chartData,
  user,
  getAccessToken,
  onRequireAuth,
}: {
  analysis: any;
  currency: string;
  ticker: string;
  chartData: any;
  user: any;
  getAccessToken: () => Promise<string | null>;
  onRequireAuth: () => void;
}) => {
  const analysisView = getAnalysisPresentation(analysis);
  if (!analysisView) return null;

  const isBull = analysisView.isBullish;
  const isHold = analysisView.isHold;
  const accentColor = isBull ? 'text-green-400' : isHold ? 'text-zinc-300' : 'text-red-400';
  const accentBg = isBull ? 'bg-green-500/10 border-green-500/30' : isHold ? 'bg-zinc-500/10 border-zinc-500/30' : 'bg-red-500/10 border-red-500/30';
  const accentGlow = isBull ? 'shadow-[0_0_30px_rgba(74,222,128,0.15)]' : isHold ? '' : 'shadow-[0_0_30px_rgba(239,68,68,0.15)]';
  const targetMovePctValue = analysisView.entry
    ? (analysisView.direction === 'bearish'
      ? ((analysisView.entry - analysisView.target) / analysisView.entry) * 100
      : ((analysisView.target - analysisView.entry) / analysisView.entry) * 100)
    : 0;
  const stopRiskPctValue = analysisView.entry
    ? (analysisView.direction === 'bearish'
      ? ((analysisView.stop_loss - analysisView.entry) / analysisView.entry) * 100
      : ((analysisView.entry - analysisView.stop_loss) / analysisView.entry) * 100)
    : 0;
  const targetMovePct = targetMovePctValue.toFixed(2);
  const stopRiskPct = stopRiskPctValue.toFixed(2);
  const rr = (stopRiskPctValue > 0 ? targetMovePctValue / stopRiskPctValue : 0).toFixed(2);
  const setupLabel = analysisView.direction === 'bearish'
    ? 'Sell-side target'
    : analysisView.direction === 'bullish'
      ? 'Buy-side target'
      : 'Balanced setup';
  const stockMeta = STOCKS.find(stock => stock.ticker === ticker);

  // AI search state (lifted into FisoDetailPanel so it lives next to the section)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiLoaderSummary, setAiLoaderSummary] = useState('');
  const [alertPrompt, setAlertPrompt] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertError, setAlertError] = useState('');
  const [isSavingAlert, setIsSavingAlert] = useState(false);
  const [stockAlerts, setStockAlerts] = useState<AlertRecord[]>([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

  const fetchAlertAuthHeaders = async () => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Please sign in before creating alerts.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const loadStockAlerts = async () => {
    if (!user || !ticker) {
      setStockAlerts([]);
      return;
    }
    setIsLoadingAlerts(true);
    try {
      const headers = await fetchAlertAuthHeaders();
      const response = await fetch(`${BACKEND}/api/v1/alerts`, { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not load alerts.');
      setStockAlerts((data.alerts ?? []).filter((alert: AlertRecord) => alert.ticker === ticker.toUpperCase()));
    } catch (err: any) {
      setAlertError(err.message || 'Could not load alerts.');
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  useEffect(() => {
    loadStockAlerts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, ticker]);

  const saveAlert = async () => {
    setAlertError('');
    setAlertMessage('');
    if (!user) {
      onRequireAuth();
      setAlertError('Sign in first so the alert can be saved to your account.');
      return;
    }
    const prompt = alertPrompt.trim() || aiPrompt.trim();
    if (!prompt) {
      setAlertError('Type an alert condition first.');
      return;
    }
    setIsSavingAlert(true);
    try {
      const headers = await fetchAlertAuthHeaders();
      const response = await fetch(`${BACKEND}/api/v1/alerts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ticker,
          prompt,
          channels: ['email'],
          email: user.email,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not create alert.');
      setAlertPrompt('');
      const notifications = Array.isArray(data.initial_check?.notifications) ? data.initial_check.notifications : [];
      const sent = notifications.filter((item: any) => item?.status === 'sent').map((item: any) => item.provider).join(', ');
      const failed = notifications.filter((item: any) => item?.status !== 'sent');
      if (failed.length > 0) {
        setAlertError(failed.map((item: any) => `${item.provider}: ${item.reason || item.error || item.response || 'failed'}`).join(' | '));
      }
      setAlertMessage(
        sent
          ? `Alert saved and sent by ${sent}: ${data.alert?.rule?.description || prompt}`
          : `Alert saved: ${data.alert?.rule?.description || prompt}`
      );
      await loadStockAlerts();
    } catch (err: any) {
      setAlertError(err.message || 'Could not create alert.');
    } finally {
      setIsSavingAlert(false);
    }
  };

  const updateSavedAlert = async (alertId: string, status: 'active' | 'paused') => {
    setAlertError('');
    try {
      const headers = await fetchAlertAuthHeaders();
      const response = await fetch(`${BACKEND}/api/v1/alerts/${alertId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not update alert.');
      await loadStockAlerts();
    } catch (err: any) {
      setAlertError(err.message || 'Could not update alert.');
    }
  };

  const deleteSavedAlert = async (alertId: string) => {
    setAlertError('');
    try {
      const headers = await fetchAlertAuthHeaders();
      const response = await fetch(`${BACKEND}/api/v1/alerts/${alertId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not delete alert.');
      await loadStockAlerts();
    } catch (err: any) {
      setAlertError(err.message || 'Could not delete alert.');
    }
  };

  const testSavedAlert = async (alertId: string) => {
    setAlertError('');
    setAlertMessage('');
    try {
      const headers = await fetchAlertAuthHeaders();
      const response = await fetch(`${BACKEND}/api/v1/alerts/${alertId}/test`, {
        method: 'POST',
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not test alert.');
      const evaluation = data.evaluation;
      const notifications = Array.isArray(data.notifications) ? data.notifications : [];
      const sent = notifications.filter((item: any) => item?.status === 'sent').map((item: any) => item.provider).join(', ');
      const failed = notifications.filter((item: any) => item?.status !== 'sent');
      if (failed.length > 0) {
        setAlertError(failed.map((item: any) => `${item.provider}: ${item.reason || item.error || item.response || 'failed'}`).join(' | '));
      }
      setAlertMessage(
        sent
          ? `Test sent by ${sent}. Condition ${evaluation?.triggered ? 'is true' : 'was checked'}: ${evaluation?.current_value ?? 'n/a'} vs ${evaluation?.target_value ?? 'n/a'}`
          : `Condition ${evaluation?.triggered ? 'is true' : 'was checked'}: ${evaluation?.current_value ?? 'n/a'} vs ${evaluation?.target_value ?? 'n/a'}`
      );
      await loadStockAlerts();
    } catch (err: any) {
      setAlertError(err.message || 'Could not test alert.');
    }
  };

  const handleAiSearch = async () => {
    if (!aiPrompt || !ticker) return;
    setIsAiRunning(true);
    setAiResult(null);
    setAiLoaderSummary(`Compiling your request for ${ticker} and reading local OHLCV history...`);
    try {
      const prompt = aiPrompt.trim();
      const res = await fetch(`${BACKEND}/api/v1/stock-ai/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          current_ticker: ticker,
          stocks: STOCKS.map(stock => ({
            name: stock.name,
            symbol: stock.symbol,
            exchange: stock.exchange,
            ticker: stock.ticker,
            currency: stock.currency,
          })),
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setAiResult({
          type: 'assistant_answer',
          title: 'AI search needs a clearer request',
          answer: data?.detail || 'The stock AI engine could not answer that yet. Try a specific date, quantity, indicator, or buy/sell rule.',
          rows: [
            ['Try', 'Buy Friday close, sell Monday open'],
            ['Try', 'If I bought 100 shares 30 days ago'],
            ['Try', 'Current RSI and support resistance'],
          ],
        });
        return;
      }
      setAiLoaderSummary(data.ai_context_summary || `Running local analytics for ${data.target_stock || ticker}...`);
      setAiResult(data);
    } catch {
      const fallback = buildMarketAnswer('help examples', analysis, ticker, currency, chartData);
      setAiResult(fallback ?? {
        type: 'assistant_answer',
        title: 'AI search fallback',
        answer: 'I could not reach the stock AI engine. The backend may be starting up, or the model/data service may be unavailable.',
        rows: [
          ['Try', 'current price'],
          ['Try', 'support and resistance'],
          ['Try', 'buy Friday close sell Monday open'],
        ],
      });
    } finally {
      setIsAiRunning(false);
    }
  };

  // ── Enter key handler for AI search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && aiPrompt.trim() && !isAiRunning) {
      handleAiSearch();
    }
  };

  const aiExamples = [
    'Buy when stock drops 1% intraday, sell at 3% profit',
    'Buy Friday close, sell Monday open',
    'If I bought 100 shares 30 days ago, profit or loss?',
    'What was the price on 15 Oct 2024?',
    'Current RSI and overbought status',
    'SMA 50, EMA 20, support and resistance',
  ];

  const topStrategies = normalizeStrategyEvals(analysis?.strategy_evals).slice(0, 10);
  const [showAllStrategies, setShowAllStrategies] = useState(false);
  const showInlineStrategyToggle = false;
  const visibleStrategies = showAllStrategies ? topStrategies : topStrategies.slice(0, 3);
  const visibleStockStories: NewsStory[] = [];

  return (
    <div className="flex flex-col gap-6">

      {/* ── Row 1: Verdict + Score + Key Metrics ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Verdict card */}
        <div className={`min-w-0 lg:col-span-3 rounded-3xl border backdrop-blur-2xl p-5 sm:p-6 flex flex-col justify-between ${accentBg} ${accentGlow} ${isBull ? 'verdict-glow-bull' : (!isBull && !isHold) ? 'verdict-glow-bear' : ''}`}>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">Algorithm Verdict</span>
            <div className={`break-words text-4xl font-black uppercase leading-none tracking-normal sm:text-5xl font-['Space_Grotesk'] ${accentColor} mb-4`}>{analysisView.displayVerdict}</div>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest block mb-2">Trade Setup</span>
            <div className="text-2xl font-['Space_Grotesk'] font-black text-white">{setupLabel}</div>
            <p className="text-[10px] text-zinc-400 mt-2 font-['JetBrains_Mono']">
              {isHold
                ? 'No active trade: price bands are shown for research only.'
                : 'Target and stop loss are aligned with the displayed verdict.'}
            </p>
          </div>
        </div>

        {/* FISO Score */}
        <div className="lg:col-span-3 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">FISO Confidence Level</span>
          <div>
            <div className="flex items-end gap-1 mb-3">
              <span className="text-5xl font-['JetBrains_Mono'] font-bold text-white">{analysisView.confidenceLevel}</span>
              <span className="text-zinc-600 text-xl mb-1">/100</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden mb-4">
              <div className="h-full rounded-full bar-shimmer transition-all duration-1000"
                style={{ width: `${analysisView.confidenceLevel}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {([
                ['Sell', analysisView.direction === 'bearish'],
                ['Buy', analysisView.direction === 'bullish'],
              ] as Array<[string, boolean]>).map(([label, active]) => (
                <div
                  key={label}
                  className={`rounded-lg py-1.5 text-[9px] font-bold uppercase tracking-widest font-['JetBrains_Mono'] ${
                    active
                      ? label === 'Buy'
                        ? 'bg-green-500/25 text-green-400'
                        : 'bg-red-500/25 text-red-400'
                      : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Price targets */}
        <div className="lg:col-span-6 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-4">
            {isHold ? 'No Active Trade' : 'Predictive Price Vectors'}
          </span>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4">
            <div className="metric-card-hover bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 hover:border-cyan-400/40 hover:bg-cyan-500/8 transition-all">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{isHold ? 'Current Price' : 'Entry Price'}</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-white">{currency}{analysisView.entry?.toLocaleString()}</span>
              <span className="text-[9px] text-zinc-500 block mt-1">{isHold ? 'Reference only' : 'Current position'}</span>
            </div>
            {isHold && (
              <>
                <div className="metric-card-hover bg-white/5 border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-all">
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Decision</span>
                  <span className="text-xl font-['Space_Grotesk'] font-black uppercase text-zinc-100">Wait</span>
                  <span className="text-[9px] text-zinc-500 block mt-1">No target or stop issued</span>
                </div>
                <div className="col-span-1 min-[420px]:col-span-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-200 font-['Space_Grotesk']">Why no trade</span>
                  <ul className="mt-3 space-y-2 text-[11px] leading-5 text-zinc-300 font-['JetBrains_Mono']">
                    {(analysisView.risk_notes?.length ? analysisView.risk_notes : ['Risk/reward and confidence gates did not clear.']).slice(0, 4).map((note: string) => (
                      <li key={note} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 rounded-full bg-amber-300" aria-hidden="true" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            {!isHold && (
              <>
            <div className="metric-card-hover bg-green-500/10 border border-green-400/30 rounded-2xl p-4 hover:border-green-400/50 hover:bg-green-500/15 transition-all">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Target Price</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-green-400">{currency}{analysisView.target?.toLocaleString()}</span>
              <span className="text-[9px] text-green-500/70 block mt-1">
                {analysisView.direction === 'bearish' ? `${targetMovePct}% downside target` : `${targetMovePct}% upside target`}
              </span>
            </div>
            <div className="metric-card-hover bg-red-500/10 border border-red-500/30 rounded-2xl p-4 hover:border-red-400/50 hover:bg-red-500/15 transition-all">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Stop Loss</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-red-400">{currency}{analysisView.stop_loss?.toLocaleString()}</span>
              <span className="text-[9px] text-red-500/70 block mt-1">
                {analysisView.direction === 'bearish' ? `${stopRiskPct}% upside risk` : `${stopRiskPct}% downside risk`}
              </span>
            </div>
            <div className="metric-card-hover bg-white/5 border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-all">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Risk:Reward</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-white">1 : {rr}</span>
              <span className="text-[9px] text-zinc-500 block mt-1">per unit risk</span>
            </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Trade Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 sm:p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">
            {isHold ? 'Trade Status' : 'Trade Timeline'}
          </span>
          {isHold ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-400/30 bg-zinc-400/10 text-zinc-200 font-black">H</div>
                <div>
                  <div className="text-sm font-black uppercase tracking-widest text-white font-['Space_Grotesk']">No trade planned</div>
                  <p className="mt-2 max-w-2xl text-[12px] leading-6 text-zinc-400 font-['JetBrains_Mono']">
                    Bullseye is not issuing a target, stop loss, expected move, or holding period because this stock did not pass the current trade-quality gates.
                  </p>
                </div>
              </div>
            </div>
          ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between py-2.5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <span className="text-green-400 text-xs font-bold">T</span>
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block">Target Date</span>
                  <span className="text-[10px] text-zinc-500">{analysis.target_date}</span>
                </div>
              </div>
              <span className="font-['JetBrains_Mono'] text-green-400 font-bold text-sm">{analysis.estimated_days}d</span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-zinc-400 text-xs font-bold">⚡</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Expected Move</span>
                  <span className="text-[10px] text-zinc-500">From current price</span>
                </div>
              </div>
              <span className={`font-['JetBrains_Mono'] font-bold text-sm ${analysisView.direction === 'bearish' ? 'text-red-400' : 'text-green-400'}`}>
                {analysisView.direction === 'bearish' ? '-' : '+'}{targetMovePct}%
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-zinc-400 text-xs font-bold">📊</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Max Risk</span>
                  <span className="text-[10px] text-zinc-500">If stop loss triggered</span>
                </div>
              </div>
              <span className="font-['JetBrains_Mono'] font-bold text-sm text-red-400">{stopRiskPct}%</span>
            </div>
          </div>
          )}
        </div>
        <div className="lg:col-span-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 sm:p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-4">Position Snapshot</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-2">Setup</span>
              <span className={`text-sm font-black uppercase font-['Space_Grotesk'] ${accentColor}`}>{analysisView.displayVerdict}</span>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-2">
                {isHold ? 'Trade State' : 'Risk:Reward'}
              </span>
              <span className="text-sm font-black text-white font-['JetBrains_Mono']">{isHold ? 'NO TRADE' : `1 : ${rr}`}</span>
            </div>
            <div className="col-span-2 rounded-2xl bg-cyan-500/5 border border-cyan-400/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Face Value</span>
                <span className="text-sm font-black text-slate-950 font-['JetBrains_Mono']">{formatFaceValue(stockMeta)}</span>
              </div>
            </div>
            <div className="col-span-2 rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Confidence</span>
                <span className="text-xs font-black text-white font-['JetBrains_Mono']">{analysisView.confidenceLevel}/100</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${analysisView.confidenceLevel}%` }} />
              </div>
            </div>
          </div>
      </div>
      </div>

      {/* ── Section 3: AI Market Search ── */}
      <div className="ai-market-panel relative overflow-hidden rounded-3xl border border-cyan-300/35 bg-slate-950/95 p-4 text-slate-100 shadow-[0_18px_50px_rgba(8,145,178,0.22)] ring-1 ring-cyan-400/15 sm:p-6">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(135deg,rgba(8,145,178,0.22),transparent_34%,rgba(15,23,42,0.36)),radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_34%)]" />
        <h3 className="relative text-[10px] font-bold text-cyan-300 tracking-[0.2em] uppercase mb-2 border-b border-cyan-300/20 pb-3 font-['Space_Grotesk'] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse inline-block"></span>
          AI Market Search
        </h3>
        <p className="relative text-[11px] text-slate-300 font-['JetBrains_Mono'] mb-4">
          Ask prices, trend questions, risk checks, profit/loss, or any buy/sell strategy in plain English.
        </p>

        <div className="relative flex flex-col sm:flex-row gap-3">
          <input
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything: buy Friday close, sell Monday open; price on 12 Feb; should I buy?"
            className="flex-1 rounded-xl border border-cyan-200 bg-white px-4 py-3.5 text-sm text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none transition-all placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-300/30 font-['JetBrains_Mono']"
          />
          <button
            onClick={handleAiSearch}
            disabled={isAiRunning || !aiPrompt.trim()}
            className="rounded-xl border border-cyan-300 bg-cyan-400 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-slate-950 shadow-[0_12px_28px_rgba(34,211,238,0.18)] transition-all hover:bg-cyan-300 disabled:opacity-40 font-['Space_Grotesk'] shrink-0"
          >
            {isAiRunning ? 'Thinking...' : 'Ask AI'}
          </button>
        </div>

        <div className="relative mt-3 flex flex-wrap gap-2">
          {aiExamples.map(example => (
            <button
              key={example}
              type="button"
              onClick={() => setAiPrompt(example)}
              className="rounded-full border border-cyan-300/25 bg-slate-900/80 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-300/15 hover:text-white font-['Space_Grotesk']"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="relative mt-5 rounded-2xl border border-emerald-300/25 bg-emerald-950/25 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 font-['Space_Grotesk']">
                AI Alerts
              </h4>
              <p className="mt-1 text-[11px] text-emerald-50/70 font-['JetBrains_Mono']">
                {user ? user.email : 'Sign in to save alerts'}
              </p>
            </div>
            {isLoadingAlerts && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-200 font-['JetBrains_Mono']">
                Loading
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <input
              value={alertPrompt}
              onChange={event => setAlertPrompt(event.target.value)}
              placeholder="Alert me when RSI crosses above 70"
              className="h-12 rounded-xl border border-emerald-200 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/30 font-['JetBrains_Mono']"
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="grid grid-cols-1 gap-3">
                <label className="flex h-11 items-center gap-2 rounded-xl border border-emerald-300/25 bg-slate-950/50 px-3 text-xs font-bold uppercase tracking-widest text-emerald-50 font-['Space_Grotesk']">
                  <input
                    type="checkbox"
                    checked
                    readOnly
                    className="h-4 w-4 accent-emerald-400"
                  />
                  Email alert
                </label>
              </div>
              <button
                type="button"
                onClick={saveAlert}
                disabled={isSavingAlert || (!alertPrompt.trim() && !aiPrompt.trim())}
                className="h-11 rounded-xl border border-emerald-200 bg-emerald-400 px-5 text-[10px] font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-300 disabled:opacity-40 font-['Space_Grotesk']"
              >
                {isSavingAlert ? 'Saving' : 'Create Alert'}
              </button>
            </div>
          </div>

          {alertError && (
            <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 font-['JetBrains_Mono']">
              {alertError}
            </div>
          )}
          {alertMessage && (
            <div className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100 font-['JetBrains_Mono']">
              {alertMessage}
            </div>
          )}

          {stockAlerts.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-2">
              {stockAlerts.map(alert => (
                <div key={alert.id} className="rounded-xl border border-white/10 bg-slate-950/55 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 font-['Space_Grotesk']">
                        {alert.status} · {(alert.channels ?? []).join(' + ') || 'email'}
                      </div>
                      <div className="mt-1 text-sm font-bold text-white font-['Space_Grotesk']">
                        {alert.rule?.description || alert.prompt}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400 font-['JetBrains_Mono']">
                        Last checked: {alert.last_checked_at ? new Date(alert.last_checked_at).toLocaleString() : 'Pending'}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => testSavedAlert(alert.id)}
                        className="rounded-lg border border-cyan-300/25 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-100 transition hover:bg-cyan-300/10 font-['Space_Grotesk']"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSavedAlert(alert.id, alert.status === 'active' ? 'paused' : 'active')}
                        className="rounded-lg border border-amber-300/25 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-amber-100 transition hover:bg-amber-300/10 font-['Space_Grotesk']"
                      >
                        {alert.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSavedAlert(alert.id)}
                        className="rounded-lg border border-red-300/25 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-red-100 transition hover:bg-red-300/10 font-['Space_Grotesk']"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI loading */}
        {isAiRunning && (
          <div className="mt-4 flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin shrink-0"></div>
            <span className="text-xs text-slate-300 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">
              {aiLoaderSummary || `Reading market data for ${ticker}...`}
            </span>
          </div>
        )}

        {/* AI results */}
        {aiResult && !isAiRunning && (
          <div className="mt-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {aiResult.error || aiResult.custom_metrics?.error ? (
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                <p className="text-red-400 text-sm font-['JetBrains_Mono']">
                  {aiResult.error || aiResult.custom_metrics?.error}
                </p>
              </div>
            ) : aiResult.type === 'holding_pnl' ? (
              <div className={`${aiResult.pnl >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'} border rounded-2xl p-4`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                  <div>
                    <span className={`text-[10px] uppercase tracking-widest font-bold font-['Space_Grotesk'] ${aiResult.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.pnl >= 0 ? 'Profit' : 'Loss'} estimate
                    </span>
                    <p className="text-sm text-zinc-400 font-['JetBrains_Mono'] mt-1">
                      {aiResult.quantity.toLocaleString()} shares from {aiResult.buyDate} to {aiResult.latestDate}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className={`text-2xl font-black font-['JetBrains_Mono'] ${aiResult.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.pnl >= 0 ? '+' : ''}{currency}{Math.abs(aiResult.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs font-bold font-['JetBrains_Mono'] ${aiResult.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.returnPct >= 0 ? '+' : ''}{aiResult.returnPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ['Buy price', aiResult.buyPrice],
                    ['Current close', aiResult.currentPrice],
                    ['Invested', aiResult.invested],
                    ['Current value', aiResult.currentValue],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                      <span className="text-lg font-['JetBrains_Mono'] font-bold text-white">
                        {currency}{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : aiResult.type === 'historical_roi' ? (
              <div className={`${aiResult.pnl >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'} border rounded-2xl p-4`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                  <div>
                    <span className={`text-[10px] uppercase tracking-widest font-bold font-['Space_Grotesk'] ${aiResult.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      Historical ROI
                    </span>
                    <p className="text-sm text-zinc-300 font-['JetBrains_Mono'] mt-1 leading-relaxed">
                      {aiResult.answer}
                    </p>
                    {!aiResult.exact_match && (
                      <p className="mt-2 text-[10px] text-amber-300 font-['JetBrains_Mono']">
                        Requested date was not a trading candle, so the nearest available candle was used.
                      </p>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <div className={`text-2xl font-black font-['JetBrains_Mono'] ${aiResult.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.pnl >= 0 ? '+' : '-'}{currency}{Math.abs(Number(aiResult.pnl || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs font-bold font-['JetBrains_Mono'] ${aiResult.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {aiResult.return_pct >= 0 ? '+' : ''}{Number(aiResult.return_pct || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ['Quantity', aiResult.quantity],
                    ['Buy close', aiResult.buy_price],
                    ['Latest close', aiResult.current_price],
                    ['Invested', aiResult.invested],
                    ['Current value', aiResult.current_value],
                    ['Buy date', aiResult.investment_date],
                    ['Latest date', aiResult.latest_date],
                    ['Ticker', aiResult.target_stock],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                      <span className="text-sm font-['JetBrains_Mono'] font-bold text-white break-words">
                        {typeof value === 'number'
                          ? (String(label).toLowerCase().includes('quantity') ? value.toLocaleString() : `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                          : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : aiResult.type === 'historical_price' ? (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold font-['Space_Grotesk']">Historical Price</span>
                  <span className="text-[10px] text-zinc-500 font-['JetBrains_Mono']">{aiResult.target_stock} · {aiResult.requested_date}</span>
                </div>
                {aiResult.candle ? (
                  <>
                    <p className="mb-4 text-sm text-zinc-300 font-['JetBrains_Mono'] leading-relaxed">{aiResult.answer}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        ['Date', aiResult.candle.date],
                        ['Open', aiResult.candle.open],
                        ['High', aiResult.candle.high],
                        ['Low', aiResult.candle.low],
                        ['Close', aiResult.candle.close],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                          <span className="text-lg font-['JetBrains_Mono'] font-bold text-white">
                            {typeof value === 'number' ? `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-zinc-300 font-['JetBrains_Mono']">No historical candle was found for this request.</p>
                )}
              </div>
            ) : aiResult.type === 'technical_analysis' ? (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold font-['Space_Grotesk']">{aiResult.title}</span>
                <p className="text-sm text-zinc-300 font-['JetBrains_Mono'] leading-relaxed mt-2 mb-4">{aiResult.answer}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {(aiResult.rows ?? []).map(([label, value]: [string, any]) => (
                    <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{String(label).replaceAll('_', ' ')}</span>
                      <span className="text-sm font-['JetBrains_Mono'] font-bold text-white break-words">
                        {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : aiResult.type === 'assistant_answer' ? (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold font-['Space_Grotesk']">{aiResult.title}</span>
                <p className="text-sm text-zinc-300 font-['JetBrains_Mono'] leading-relaxed mt-2 mb-4">{aiResult.answer}</p>
                {aiResult.rows?.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {aiResult.rows.map(([label, value]: [string, any]) => (
                      <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                        <span className="text-sm font-['JetBrains_Mono'] font-bold text-white break-words">
                          {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : aiResult.type === 'price_lookup' ? (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                {aiResult.candle ? (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold font-['Space_Grotesk']">Price Lookup</span>
                      <span className="text-[10px] text-zinc-500 font-['JetBrains_Mono']">{ticker} · {aiResult.requestedDate}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        ['Open', aiResult.candle.open],
                        ['High', aiResult.candle.high],
                        ['Low', aiResult.candle.low],
                        ['Close', aiResult.candle.close],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">{label}</span>
                          <span className="text-lg font-['JetBrains_Mono'] font-bold text-white">
                            {currency}{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-4">
                    <p className="text-cyan-200/80 text-sm font-['JetBrains_Mono']">
                      No candle found for {ticker} on {aiResult.requestedDate}. It may be a market holiday, weekend, or outside loaded chart history.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {([
                        ['Previous trading day', aiResult.nearest?.previous],
                        ['Next trading day', aiResult.nearest?.next],
                      ] as Array<[string, any]>).map(([label, candle]) => (
                        <div key={label} className="bg-black/30 rounded-xl p-3 border border-white/5">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-2">{label}</span>
                          {candle ? (
                            <div className="grid grid-cols-2 gap-2 text-xs font-['JetBrains_Mono']">
                              <span className="text-cyan-300 col-span-2">{candle.day}</span>
                              <span>O: {currency}{Number(candle.open).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              <span>C: {currency}{Number(candle.close).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              <span>H: {currency}{Number(candle.high).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              <span>L: {currency}{Number(candle.low).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500 font-['JetBrains_Mono']">Not available in loaded data</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Backtest metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    {
                      label: 'Total Trades',
                      value: aiResult.custom_metrics?.total_trades,
                      suffix: '',
                      color: 'text-white',
                      icon: '📈'
                    },
                    {
                      label: 'Win Rate',
                      value: aiResult.custom_metrics?.win_rate,
                      suffix: '%',
                      color: (aiResult.custom_metrics?.win_rate ?? 0) >= 50 ? 'text-green-400' : 'text-red-400',                      icon: '🎯'
                    },
                    {
                      label: 'Avg Return / Trade',
                      value: aiResult.custom_metrics?.avg_return_per_trade_pct,
                      suffix: '%',
                      color: (aiResult.custom_metrics?.avg_return_per_trade_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                      icon: '⚡'
                    },
                    {
                      label: 'Total Return',
                      value: aiResult.custom_metrics?.total_return_pct,
                      suffix: '%',
                      color: (aiResult.custom_metrics?.total_return_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                      icon: '💰'
                    },
                  ].map(({ label, value, suffix, color, icon }) => (
                    <div key={label} className="rounded-2xl border border-cyan-300/15 bg-slate-900/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{icon}</span>
                        <span className="text-[9px] text-slate-300 uppercase tracking-widest font-bold font-['Space_Grotesk']">{label}</span>
                      </div>
                      <span className={`text-xl font-['JetBrains_Mono'] font-bold ${color}`}>
                        {value !== undefined && value !== null ? `${value}${suffix}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-slate-900/75 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-black font-['Space_Grotesk']">Strategy analysis</span>
                      <p className="mt-2 text-sm text-zinc-300 leading-relaxed font-['JetBrains_Mono']">
                        {aiResult.custom_metrics?.analysis_text || aiResult.custom_metrics?.warning || 'Strategy completed. Review the trade log below for entries and exits.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 shrink-0 min-w-[320px]">
                      {[
                        ['Wins', aiResult.custom_metrics?.summary?.wins ?? aiResult.custom_metrics?.wins ?? 0],
                        ['Losses', aiResult.custom_metrics?.summary?.losses ?? aiResult.custom_metrics?.losses ?? 0],
                        ['Best', `${aiResult.custom_metrics?.summary?.best_trade_pct ?? aiResult.custom_metrics?.best_trade_pct ?? 0}%`],
                        ['Worst', `${aiResult.custom_metrics?.summary?.worst_trade_pct ?? aiResult.custom_metrics?.worst_trade_pct ?? 0}%`],
                        ['Max DD', `${aiResult.custom_metrics?.summary?.max_drawdown_pct ?? aiResult.custom_metrics?.max_drawdown_pct ?? 0}%`],
                        ['Buy & Hold', `${aiResult.custom_metrics?.summary?.buy_and_hold_return_pct ?? aiResult.custom_metrics?.buy_and_hold_return_pct ?? 0}%`],
                        ['Alpha', `${aiResult.custom_metrics?.summary?.alpha_vs_buy_hold_pct ?? aiResult.custom_metrics?.alpha_vs_buy_hold_pct ?? 0}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-white/90 border border-cyan-100 p-3 text-slate-950">
                          <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block">{label}</span>
                          <span className="text-sm text-slate-950 font-bold font-['JetBrains_Mono']">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/90 border border-cyan-100 p-3 text-slate-950">
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Entry rule</span>
                      <span className="text-xs text-slate-950 font-['JetBrains_Mono'] break-words">{aiResult.custom_metrics?.buy_expr}</span>
                    </div>
                    <div className="rounded-xl bg-white/90 border border-cyan-100 p-3 text-slate-950">
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Exit rule</span>
                      <span className="text-xs text-slate-950 font-['JetBrains_Mono'] break-words">{aiResult.custom_metrics?.sell_expr}</span>
                    </div>
                  </div>
                </div>

                {aiResult.custom_metrics?.open_trade && (
                  <div className="mt-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                    <span className="text-[10px] text-amber-500 uppercase tracking-widest font-black font-['Space_Grotesk']">Open trade</span>
                    <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
                      {[
                        ['Buy date', `${aiResult.custom_metrics.open_trade.buy_date} (${aiResult.custom_metrics.open_trade.buy_day || '-'})`],
                        ['Buy price', aiResult.custom_metrics.open_trade.buy_price],
                        ['Target', aiResult.custom_metrics.open_trade.target_price ?? '-'],
                        ['Current', aiResult.custom_metrics.open_trade.current_price],
                        ['Return', `${aiResult.custom_metrics.open_trade.return_pct}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-black/25 border border-white/5 p-3">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block">{label}</span>
                          <span className="text-sm text-white font-bold font-['JetBrains_Mono']">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiResult.custom_metrics?.trades?.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-200 bg-white text-slate-950 shadow-[0_18px_45px_rgba(2,6,23,0.22)]">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-[10px] text-cyan-700 uppercase tracking-widest font-black font-['Space_Grotesk']">
                        {aiResult.custom_metrics?.mode === 'weekday_projection' ? 'Projected setups' : 'Trade log'}
                      </span>
                      <span className="text-[9px] text-slate-600 font-['JetBrains_Mono']">
                        {aiResult.custom_metrics?.mode === 'weekday_projection' ? aiResult.custom_metrics.scope : `Latest ${aiResult.custom_metrics.trades.length}`}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left">
                        <thead className="bg-slate-100">
                          <tr>
                            {['Buy day', 'Buy date', 'Buy', 'Sell day', 'Sell date', 'Sell', 'Hold', 'Return', 'Result'].map(label => (
                              <th key={label} className="px-4 py-3 text-[9px] text-slate-600 uppercase tracking-widest font-black font-['Space_Grotesk']">{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {aiResult.custom_metrics.trades.map((trade: any, index: number) => (
                            <tr key={`${trade.buy_date}-${trade.sell_date}-${index}`} className="border-t border-slate-200 odd:bg-white even:bg-slate-50 hover:bg-cyan-50">
                              <td className="px-4 py-3 text-xs text-slate-800 font-['JetBrains_Mono']">{trade.buy_day || '-'}</td>
                              <td className="px-4 py-3 text-xs text-slate-800 font-['JetBrains_Mono']">{trade.buy_date}</td>
                              <td className="px-4 py-3 text-xs text-slate-950 font-bold font-['JetBrains_Mono']">{currency}{trade.buy_price}</td>
                              <td className="px-4 py-3 text-xs text-slate-800 font-['JetBrains_Mono']">{trade.sell_day || '-'}</td>
                              <td className="px-4 py-3 text-xs text-slate-800 font-['JetBrains_Mono']">{trade.sell_date}</td>
                              <td className="px-4 py-3 text-xs text-slate-950 font-bold font-['JetBrains_Mono']">{currency}{trade.sell_price}</td>
                              <td className="px-4 py-3 text-xs text-slate-800 font-['JetBrains_Mono']">{trade.holding_days}d</td>
                              <td className={`px-4 py-3 text-xs font-bold font-['JetBrains_Mono'] ${trade.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.return_pct}%</td>
                              <td className={`px-4 py-3 text-xs font-black font-['Space_Grotesk'] ${trade.result === 'PROJECTED' ? 'text-cyan-300' : trade.result === 'WIN' ? 'text-green-400' : 'text-red-400'}`}>{trade.result}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Section 4: Bullseye Top 10 Recommended Strategies ── */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <span className="font-black text-black font-['Space_Grotesk'] text-sm">X</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase font-['Space_Grotesk']">
                <span className="tracking-widest"><span className="text-slate-950">BULLS</span><span className="text-cyan-500">EYE</span></span> will recommend
              </h3>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-['JetBrains_Mono']">
                Top 10 strategies ranked by signal score · Best fit first
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-800 px-3 py-1.5 rounded-full font-bold uppercase tracking-widest font-['JetBrains_Mono']">
              {topStrategies.length} Active Signals
            </span>
            {topStrategies.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllStrategies(prev => !prev)}
                className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-cyan-800 hover:bg-cyan-500/10 hover:border-cyan-400/40 transition-all flex items-center justify-center"
                aria-label={showAllStrategies ? 'Collapse strategies list' : 'Expand strategies list'}
                aria-expanded={showAllStrategies}
              >
                <span className={`text-sm transition-transform ${showAllStrategies ? 'rotate-180' : ''}`}>⌄</span>
              </button>
            )}
          </div>
        </div>

        {topStrategies.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-xs text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">Computing signal matrix...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleStrategies.map((s: any, rank: number) => {
              const isBestFit = rank === 0;
              const scoreColor = s.score >= 80 ? '#4ade80' : s.score >= 60 ? '#86efac' : s.score >= 40 ? '#fbbf24' : '#f87171';
              // Rank 0,1 always visible. Rank 2 = blurred sneak peek. Rank 3+ hidden until expanded.
              const isSneak = !showAllStrategies && rank === 2;
              return (
                <div key={s.id}>
                  {/* Sneak-peek wrapper: blur + bottom fade + no interaction */}
                  <div className={isSneak ? 'relative' : ''}>
                    <div
                      className={`strategy-row relative rounded-2xl p-4 transition-all duration-200 ${
                        isBestFit
                          ? 'bg-gradient-to-r from-cyan-900/30 to-fuchsia-900/10 border border-cyan-400/40 shadow-[0_0_25px_rgba(6,182,212,0.12)]'
                          : 'bg-black/30 border border-white/5'
                      } ${isSneak ? 'blur-[3px] opacity-60 pointer-events-none select-none' : ''}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm font-['JetBrains_Mono'] ${
                          isBestFit ? 'bg-cyan-400 text-black' : 'bg-white/5 text-zinc-500'
                        }`}>
                          {String(rank + 1).padStart(2, '0')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className={`font-bold text-sm uppercase font-['Space_Grotesk'] ${isBestFit ? 'text-white' : 'text-zinc-200'}`}>
                              {s.name}
                            </span>
                            {isBestFit && (
                              <span className="text-[8px] bg-cyan-400 text-black px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                                ★ Best Fit Strategy
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">{s.desc}</p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          <span className="text-lg font-['JetBrains_Mono'] font-bold" style={{ color: scoreColor }}>{s.score}</span>
                          <div className="w-16 strategy-bar bg-white/10">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, backgroundColor: scoreColor }} />
                          </div>
                          <span className="text-[8px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest">/100</span>
                        </div>
                      </div>
                    </div>
                    {/* Bottom fade over the sneak-peek card */}
                    {isSneak && (
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent rounded-b-2xl pointer-events-none" />
                    )}
                  </div>
                  {/* Expand / collapse button — shown after sneak-peek card */}
                  {showInlineStrategyToggle && rank === 2 && topStrategies.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setShowAllStrategies(prev => !prev)}
                      className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-cyan-500/10 hover:border-cyan-400/40 hover:text-cyan-400 transition-all text-[10px] font-black uppercase tracking-widest font-['Space_Grotesk']"
                    >
                      {showAllStrategies ? (
                        <>
                          <span className="rotate-180 inline-block">⌄</span>
                          Show less
                        </>
                      ) : (
                        <>
                          <span>⌄</span>
                          Show {topStrategies.length - 2} more strategies
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
            {topStrategies.length > 2 && (
              <button
                type="button"
                onClick={() => setShowAllStrategies(prev => !prev)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:bg-cyan-500/10 hover:border-cyan-400/40 hover:text-cyan-400 transition-all text-[10px] font-black uppercase tracking-widest font-['Space_Grotesk']"
              >
                {showAllStrategies ? (
                  <>
                    <span className="rotate-180 inline-block">v</span>
                    Show less
                  </>
                ) : (
                  <>
                    <span>v</span>
                    Show {topStrategies.length - 2} more strategies
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Section 5: Global NLP Feed (LAST) ── */}
      {false && (
      <div className="stock-news-panel bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] mb-8">
        <div className="flex items-center mb-5 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block"></span>
            <span className="stock-news-heading text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk']">Stock News</span>
          </div>
        </div>

        <ul className="grid gap-3 md:grid-cols-2">
          {visibleStockStories.map((story, i: number) => {
            const { title, source, url } = story;
            return (
              <li key={`${title}-${i}`} className="stock-news-card rounded-2xl border border-white/10 bg-white/[0.03] p-4 leading-relaxed transition-all hover:border-cyan-400/40 hover:bg-white/[0.06]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="stock-news-title block text-sm font-black text-zinc-100 transition-colors hover:text-cyan-300">
                      {title}
                    </a>
                  ) : (
                    <span className="stock-news-title block text-sm font-black text-zinc-100 transition-colors">{title}</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {source && (
                    <span className="text-[9px] text-cyan-400/80 font-['JetBrains_Mono'] uppercase tracking-widest">
                      {source}
                    </span>
                  )}
                  {url && (
                    <span className="rounded-full border border-cyan-400/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-cyan-300 font-['JetBrains_Mono']">
                      Open news
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-zinc-400 font-['JetBrains_Mono']">{buildMarketNewsRead(title)}</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 inline-block"></span>
          <span className="text-[9px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest">
            News sentiment derived via NLP - refreshed on each analysis
          </span>
        </div>
      </div>
      )}

    </div>
  );
};

const FundamentalsTable = ({
  title,
  subtitle,
  table,
  currency,
}: {
  title: string;
  subtitle: string;
  table: any;
  currency: string;
}) => {
  const [tableScale, setTableScale] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 0.65 : 1.0
  );
  const columns = table?.columns ?? [];
  const rows = table?.rows ?? [];
  const cellPad = `${Math.round(tableScale * 12)}px ${Math.round(tableScale * 16)}px`;

  return (
    <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-xl font-black text-white font-['Space_Grotesk']">{title}</h3>
          <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">{subtitle}</p>
        </div>
        {/* Zoom controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setTableScale(z => Math.max(0.45, parseFloat((z - 0.1).toFixed(1))))}
            className="w-7 h-7 rounded-lg border border-white/15 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/15 flex items-center justify-center text-base font-bold transition-all select-none"
            title="Zoom out table"
          >−</button>
          <span className="text-[9px] text-zinc-500 font-['JetBrains_Mono'] w-8 text-center tabular-nums">
            {Math.round(tableScale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setTableScale(z => Math.min(1.4, parseFloat((z + 0.1).toFixed(1))))}
            className="w-7 h-7 rounded-lg border border-white/15 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/15 flex items-center justify-center text-base font-bold transition-all select-none"
            title="Zoom in table"
          >+</button>
        </div>
      </div>

      {rows.length === 0 || columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-xs text-zinc-500 font-['JetBrains_Mono']">
          This free data source does not expose this statement for the selected stock yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table
            className="w-full text-left border-collapse"
            style={{ fontSize: `${tableScale * 0.8125}rem`, minWidth: `${Math.round(tableScale * 900)}px` }}
          >
            <thead className="bg-white/5">
              <tr>
                <th
                  className="text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk'] whitespace-nowrap"
                  style={{ padding: cellPad }}
                >Line Item</th>
                {columns.map((column: string) => (
                  <th
                    key={column}
                    className="text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk'] whitespace-nowrap"
                    style={{ padding: cellPad }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td
                    className="text-zinc-200 font-semibold whitespace-nowrap"
                    style={{ padding: cellPad }}
                  >{humanizeLabel(row.label)}</td>
                  {row.values.map((value: any, index: number) => (
                    <td
                      key={`${row.label}-${index}`}
                      className="text-white font-['JetBrains_Mono'] whitespace-nowrap"
                      style={{ padding: cellPad }}
                    >
                      {value === null || value === undefined
                        ? '-'
                        : Math.abs(Number(value)) >= 100000
                          ? formatCompactRupees(value)
                          : formatCurrencyNumber(value, currency, 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const FundamentalsSnapshotCard = ({
  stock,
  currency,
  fundamentals,
  quote,
  isLoading,
}: {
  stock?: typeof STOCKS[number] | null;
  currency: string;
  fundamentals?: { summary?: Record<string, unknown> } | null;
  quote?: QuoteSnapshot | null;
  isLoading: boolean;
}) => {
  const summary = fundamentals?.summary ?? {};
  const currentPrice = quote?.price ?? summary.current_price;
  const marketCapUnit = typeof summary.market_cap_unit === 'string' ? summary.market_cap_unit : undefined;
  const highLow = summary.high_52_week && summary.low_52_week
    ? `${formatCurrencyNumber(summary.high_52_week, currency, 2)} / ${formatCurrencyNumber(summary.low_52_week, currency, 2)}`
    : '-';
  const items = [
    { label: 'Market Cap', value: formatMarketCap(summary.market_cap, marketCapUnit, currency) },
    { label: 'Current Price', value: formatCurrencyNumber(currentPrice, currency, 2) },
    { label: 'High / Low', value: highLow },
    { label: 'Stock P/E', value: formatRatioValue(summary.trailing_pe) },
    { label: 'Book Value', value: formatCurrencyNumber(summary.book_value, currency, 2) },
    { label: 'Dividend Yield', value: formatRatioValue(summary.dividend_yield, 'percent') },
    { label: 'ROE', value: formatRatioValue(summary.return_on_equity, 'percent') },
    { label: 'Face Value', value: formatFaceValue(stock, summary.face_value) },
  ];

  return (
    <aside className="order-1 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_22px_70px_rgba(15,23,42,0.12)] sm:p-5 xl:order-2">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 font-['Space_Grotesk']">Key Fundamentals</div>
          <h2 className="mt-1 truncate text-lg font-black text-slate-950 font-['Space_Grotesk']">{stock?.name || stock?.symbol || 'Stock'}</h2>
        </div>
        {quote?.change_percent !== undefined && (
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black font-['JetBrains_Mono'] ${quote.change_percent >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {quote.change_percent >= 0 ? '+' : ''}{quote.change_percent.toFixed(2)}%
          </span>
        )}
      </div>
      {isLoading && !fundamentals ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs font-bold uppercase tracking-widest text-slate-400 font-['JetBrains_Mono']">
          Loading fundamentals
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map(item => (
            <div key={item.label} className="min-w-0 rounded-2xl bg-slate-50 px-3 py-3">
              <div className="text-[10px] font-semibold text-slate-500">{item.label}</div>
              <div className="mt-1 truncate text-sm font-black text-slate-950 font-['JetBrains_Mono']" title={item.value}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};

const IndiaDetailedAnalysisPanel = ({
  ticker,
  stock,
  currency,
  fundamentals,
  isLoading,
}: {
  ticker: string;
  stock: typeof STOCKS[number];
  currency: string;
  fundamentals: any;
  isLoading: boolean;
}) => {
  const summary = fundamentals?.summary ?? {};
  const company = fundamentals?.company ?? {};
  const ratios = (fundamentals?.ratios ?? []).filter((ratio: any) => ratio?.value !== null && ratio?.value !== undefined);
  const highlights = [
    { label: 'Market Cap', value: formatMarketCap(summary.market_cap, summary.market_cap_unit, currency) },
    { label: 'Current Price', value: formatCurrencyNumber(summary.current_price, currency, 2) },
    { label: 'Face Value', value: formatFaceValue(stock, summary.face_value) },
    { label: '52W High / Low', value: summary.high_52_week && summary.low_52_week ? `${formatCurrencyNumber(summary.high_52_week, currency, 2)} / ${formatCurrencyNumber(summary.low_52_week, currency, 2)}` : '-' },
    { label: 'Trailing P/E', value: formatRatioValue(summary.trailing_pe) },
    { label: 'Book Value', value: formatCurrencyNumber(summary.book_value, currency, 2) },
    { label: 'Dividend Yield', value: formatRatioValue(summary.dividend_yield, 'percent') },
    { label: 'ROE', value: formatRatioValue(summary.return_on_equity, 'percent') },
  ];
  const [showFullAbout, setShowFullAbout] = useState(false);
  const aboutDescription = company.description || `${stock.name} detailed profile will expand as we ingest more NSE/BSE filings.`;
  const isLongAbout = aboutDescription.length > 240;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
          <span className="text-xs text-zinc-500 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">
            Loading free fundamentals for {ticker}...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">{resolveMarket(stock.exchange) === 'US' ? 'US Stock Analytics' : 'Indian Stock Analytics'}</h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">
                Free fundamentals pipeline for {stock.symbol} using cached market data.
              </p>
            </div>
            <span className="text-[10px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-full font-bold uppercase tracking-widest font-['JetBrains_Mono']">
              {resolveMarket(stock.exchange)}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {highlights.map((item) => (
              <div key={item.label} className="metric-card-hover highlight-card rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 p-2.5 sm:p-4 hover:border-cyan-500/25 cursor-default">
                <div className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk'] leading-tight">{item.label}</div>
                <div className="mt-1.5 sm:mt-2 text-sm sm:text-lg font-bold text-white font-['JetBrains_Mono'] break-words leading-snug">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">About</h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">
                Company profile and business context
              </p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="relative">
              <div className={isLongAbout && !showFullAbout ? 'about-truncated' : ''}>
                <p className="text-zinc-200 leading-relaxed text-[13px]">{aboutDescription}</p>
              </div>
              {isLongAbout && (
                <button
                  type="button"
                  onClick={() => setShowFullAbout(prev => !prev)}
                  className="mt-2 flex items-center gap-1.5 text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-widest transition-colors"
                >
                  {showFullAbout ? 'Show less' : 'Read more'}
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-300 ${showFullAbout ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {[
                ['Sector', company.sector],
                ['Industry', company.industry],
                ['Website', company.website],
                ['Employees', company.employees ? formatIndianNumber(company.employees, 0) : null],
              ].map(([label, value]) => (
                <div key={label} className="metric-card-hover rounded-2xl border border-white/10 bg-white/5 p-3 hover:border-cyan-500/25">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">{label}</div>
                  <div className="mt-2 text-sm text-white font-['JetBrains_Mono'] break-words">{value || '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <FundamentalsTable
        title="Quarterly Results"
        subtitle="Free statement data mapped from the latest available quarterly income rows."
        table={fundamentals?.statements?.quarterly_results}
        currency={currency}
      />

      <FundamentalsTable
        title="Profit & Loss"
        subtitle="Annual income statement history from the free backend dataset."
        table={fundamentals?.statements?.profit_and_loss}
        currency={currency}
      />

      <FundamentalsTable
        title="Balance Sheet"
        subtitle="Annual balance sheet rows normalized into a dashboard-ready table."
        table={fundamentals?.statements?.balance_sheet}
        currency={currency}
      />

      <FundamentalsTable
        title="Cash Flow"
        subtitle="Annual cash flow rows pulled into the India-only detailed view."
        table={fundamentals?.statements?.cash_flow}
        currency={currency}
      />

      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-white font-['Space_Grotesk']">Key Ratios</h3>
            <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 font-['JetBrains_Mono']">
              Highlights available from the free source for this stock.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {ratios.length > 0 ? ratios.map((ratio: any) => (
            <div key={ratio.label} className="metric-card-hover highlight-card rounded-2xl border border-white/10 bg-white/5 p-4 hover:border-cyan-500/25">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black font-['Space_Grotesk']">{ratio.label}</div>
              <div className="mt-2 text-lg font-bold text-white font-['JetBrains_Mono']">{formatRatioValue(ratio.value, ratio.kind)}</div>
            </div>
          )) : (
            <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-xs text-zinc-500 font-['JetBrains_Mono']">
              Ratio fields are not available yet for this symbol.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function HomeContent() {
  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState<string | null>(null);
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeMarket, setActiveMarket] = useState<MarketScope>('INDIA');
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview');
  const [chartRange, setChartRange] = useState<ChartRange>('1y');
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [indicatorQuery, setIndicatorQuery] = useState('');
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [marketPage, setMarketPage] = useState(1);
  const [assetColumnCount, setAssetColumnCount] = useState(2);
  const chartRef = useRef<HTMLDivElement>(null);
  const indicatorPaneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const expandedTickerRef = useRef<string | null>(null);
  const previewHistoryOpenRef = useRef(false);

  // ── Auth state ───────────────────────────────────────────────────────────
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showNotificationConsent, setShowNotificationConsent] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [notificationError, setNotificationError] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [dailySignalPreview, setDailySignalPreview] = useState<DailySignalRecord[]>([]);
  const [authPromptDismissed, setAuthPromptDismissed] = useState(false);
  const [cachedQuote, setCachedQuote] = useState<QuoteSnapshot | undefined>(undefined);
  const [cachedChart, setCachedChart] = useState<any>(undefined);
  const [cachedAnalysis, setCachedAnalysis] = useState<any>(undefined);
  const [cachedFundamentals, setCachedFundamentals] = useState<any>(undefined);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const notificationConsentVersion = process.env.NEXT_PUBLIC_NOTIFICATION_CONSENT_VERSION || '2026-05-29';
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef<any>(null);
  const selectedStock = ticker ? STOCKS.find(s => s.ticker === ticker) ?? null : null;
  const canOpenDetailedAnalysis = canShowDetailedAnalysis(selectedStock);

  // Check if Supabase is available
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseAvailable = !!(supabaseUrl && supabaseKey);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    if (!supabaseAvailable) {
      setAuthReady(true);
      return () => {};
    }

    setAuthReady(false);

    getSharedSupabaseClient(supabaseUrl!, supabaseKey!).then((client) => {
      if (!mounted) return;

      supabaseRef.current = client;
      const sb = client;

      sb.auth.getSession().then((result: any) => {
        if (!mounted) return;
        setUser(result?.data?.session?.user ?? null);
        setAuthReady(true);
      });

      const authListener = sb.auth.onAuthStateChange((event: string, session: any) => {
        if (!mounted) return;
        const newUser = session?.user ?? null;
        setUser(newUser);
        setAuthReady(true);
        // 'SIGNED_IN' fires only on actual sign-in, not on page reload (which is 'INITIAL_SESSION')
        if (event === 'SIGNED_IN' && newUser) {
          const name =
            newUser.user_metadata?.full_name ||
            newUser.user_metadata?.name ||
            newUser.email?.split('@')[0] ||
            'there';
          setWelcomeName(name);
          setShowWelcome(true);
          setTimeout(() => setShowWelcome(false), 4200);
          setShowAuthModal(false);
          setShowProfileMenu(false);
          setAuthEmail('');
          setAuthPassword('');
          setAuthError('');
          setAuthSuccess('');
        }
      });

      subscription = authListener.data.subscription;
    }).catch(() => {
      if (!mounted) return;
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [supabaseAvailable, supabaseKey, supabaseUrl]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!showProfileMenu) return;
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showProfileMenu]);

  // Sign-in is mandatory: once the session check finishes, force the auth modal
  // open for anyone who is not signed in, and close it as soon as they are.
  useEffect(() => {
    if (!authReady) return;
    setShowAuthModal(!user);
  }, [authReady, user]);

  const dismissAuthModal = () => {
    setAuthPromptDismissed(true);
    setShowAuthModal(false);
    setAuthError('');
    setAuthSuccess('');
  };

  const getSupabaseClient = async () => {
    if (supabaseRef.current) return supabaseRef.current;
    supabaseRef.current = await getSharedSupabaseClient(supabaseUrl!, supabaseKey!);
    return supabaseRef.current;
  };

  const handleGoogleSignIn = async () => {
    if (!supabaseAvailable) {
      setAuthError('Sign-in is not configured for this deployment yet.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const sb = await getSupabaseClient();
      // Always redirect back to the exact origin so it works on Vercel, localhost, etc.
      const redirectTo = window.location.origin + '/';
      await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
    } catch (err: any) {
      setAuthError(err.message || 'Google sign-in failed. Try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!authEmail || !authPassword) { setAuthError('Please fill in all fields.'); return; }
    if (!supabaseAvailable) {
      setAuthError('Sign-in is not configured for this deployment yet.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');
    try {
      const sb = await getSupabaseClient();
      if (authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        if (data.user) {
          // onAuthStateChange 'SIGNED_IN' will handle welcome animation + modal close
          setAuthSuccess('Account created! Check your email to verify.');
          goHome();
        } else {
          setAuthSuccess('Account created! Check your email to verify.');
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
        // onAuthStateChange 'SIGNED_IN' handles welcome animation + modal/menu close
        goHome();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabaseAvailable) return;
    const sb = await getSupabaseClient();
    await sb.auth.signOut();
    setUser(null);
    setShowProfileMenu(false);
    setShowNotificationSettings(false);
    setShowNotificationConsent(false);
    setNotificationPreference(DEFAULT_NOTIFICATION_PREFERENCE);
    setDailySignalPreview([]);
  };

  const getAccessToken = async () => {
    if (!supabaseAvailable) return null;
    const sb = await getSupabaseClient();
    const result = await sb.auth.getSession();
    return result?.data?.session?.access_token ?? null;
  };

  const getNotificationHeaders = async () => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Please sign in before changing notification settings.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const loadDailySignalPreview = async (nextPreference?: NotificationPreference) => {
    const activePreference = nextPreference || notificationPreference;
    try {
      const params = new URLSearchParams({
        market: activePreference.market,
        risk_level: activePreference.risk_level,
        signal_type: activePreference.signal_type,
      });
      const response = await fetch(`${BACKEND}/api/v1/signals/today?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not load signal preview.');
      setDailySignalPreview(Array.isArray(data.signals) ? data.signals : []);
    } catch {
      setDailySignalPreview([]);
    }
  };

  const loadNotificationPreference = async () => {
    if (!user) {
      setNotificationPreference(DEFAULT_NOTIFICATION_PREFERENCE);
      setDailySignalPreview([]);
      return;
    }
    setNotificationLoading(true);
    setNotificationError('');
    try {
      const headers = await getNotificationHeaders();
      const response = await fetch(`${BACKEND}/api/v1/notification-preferences`, { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not load notification settings.');
      const nextPreference = {
        ...DEFAULT_NOTIFICATION_PREFERENCE,
        ...data.preference,
        email_time: getSafeNotificationTime(
          (data.preference?.market as NotificationPreference['market']) || DEFAULT_NOTIFICATION_PREFERENCE.market,
          data.preference?.email_time,
        ),
      } as NotificationPreference;
      setNotificationPreference(nextPreference);
      await loadDailySignalPreview(nextPreference);
    } catch (err: any) {
      setNotificationError(getFriendlyErrorMessage(err, 'Could not load notification settings.'));
    } finally {
      setNotificationLoading(false);
    }
  };

  useEffect(() => {
    loadNotificationPreference();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!notificationMessage) return;
    const timer = window.setTimeout(() => {
      setNotificationMessage('');
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notificationMessage]);

  const patchNotificationPreference = (patch: Partial<NotificationPreference>) => {
    setNotificationPreference(current => {
      const next = { ...current, ...patch };
      if (patch.market && !isNotificationTimeValid(patch.market, next.email_time)) {
        next.email_time = getSafeNotificationTime(patch.market, next.email_time);
      }
      if (patch.email_time) {
        next.email_time = normalizeNotificationTimeValue(patch.email_time);
      }
      return next;
    });
  };

  const saveNotificationPreference = async (payload?: Partial<NotificationPreference>) => {
    if (!user) {
      setNotificationError('Sign in first to save daily stock email settings.');
      setShowAuthModal(true);
      return;
    }
    setNotificationSaving(true);
    setNotificationError('');
    setNotificationMessage('');
    try {
      const market = (payload?.market || notificationPreference.market) as NotificationPreference['market'];
      const rawEmailTime = normalizeNotificationTimeValue(payload?.email_time || notificationPreference.email_time);
      const emailTime = isNotificationTimeValid(market, rawEmailTime)
        ? rawEmailTime
        : getSafeNotificationTime(market, rawEmailTime);
      const timeWasAdjusted = emailTime !== rawEmailTime;
      if (timeWasAdjusted) {
        setNotificationPreference(current => ({ ...current, market, email_time: emailTime }));
      }
      const headers = await getNotificationHeaders();
      const requestBody = {
        ...notificationPreference,
        ...payload,
        email: user.email,
        market,
        email_time: emailTime,
      };
      const response = await fetch(`${BACKEND}/api/v1/notification-preferences`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not save notification settings.');
      const nextPreference = {
        ...DEFAULT_NOTIFICATION_PREFERENCE,
        ...data.preference,
        email_time: getSafeNotificationTime(
          (data.preference?.market as NotificationPreference['market']) || market,
          data.preference?.email_time,
        ),
      } as NotificationPreference;
      setNotificationPreference(nextPreference);
      setShowNotificationSettings(false);
      setShowNotificationConsent(false);
      setNotificationMessage(
        timeWasAdjusted
          ? `Notification settings saved. Time adjusted to ${emailTime} IST.`
          : 'Notification settings saved for next-trading-day stock emails.'
      );
      await loadDailySignalPreview(nextPreference);
    } catch (err: any) {
      setNotificationError(getFriendlyErrorMessage(err, 'Could not save notification settings.'));
    } finally {
      setNotificationSaving(false);
    }
  };

  const sendNotificationEmailNow = async (deliveryMode: InstantSignalDeliveryMode = 'next_day') => {
    if (!user) {
      setNotificationError('Sign in first to send a stock signal email.');
      setShowAuthModal(true);
      return;
    }
    setNotificationSaving(true);
    setNotificationError('');
    setNotificationMessage('');
    try {
      const market = notificationPreference.market;
      const rawEmailTime = normalizeNotificationTimeValue(notificationPreference.email_time);
      const emailTime = isNotificationTimeValid(market, rawEmailTime)
        ? rawEmailTime
        : getSafeNotificationTime(market, rawEmailTime);
      if (emailTime !== rawEmailTime) {
        setNotificationPreference(current => ({ ...current, email_time: emailTime }));
      }
      const headers = await getNotificationHeaders();
      const response = await fetch(`${BACKEND}/api/v1/notification-preferences/send-now`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...notificationPreference,
          email: user.email,
          email_time: emailTime,
          delivery_mode: deliveryMode,
          signal_type: deliveryMode === 'today' ? 'Intraday' : notificationPreference.signal_type,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not send the stock signal email right now.');
      const nextPreference = {
        ...DEFAULT_NOTIFICATION_PREFERENCE,
        ...data.preference,
        email_time: getSafeNotificationTime(
          (data.preference?.market as NotificationPreference['market']) || market,
          data.preference?.email_time,
        ),
      } as NotificationPreference;
      setNotificationPreference(nextPreference);
      setShowNotificationConsent(false);
      setShowNotificationSettings(false);
      setNotificationMessage(
        data.notification?.status === 'sent'
          ? (
            deliveryMode === 'today'
              ? `Today's intraday stock signal email sent for ${data.model_run?.target_date || 'today'}.`
              : `Next-trading-day stock signal email sent for ${data.model_run?.target_date || 'the next session'}.`
          )
          : `Instant email status: ${data.notification?.status || 'processed'}.`
      );
      await loadDailySignalPreview(nextPreference);
    } catch (err: any) {
      setNotificationError(getFriendlyErrorMessage(err, 'Could not send the stock signal email right now.'));
    } finally {
      setNotificationSaving(false);
    }
  };

  const confirmEnableDailySignals = async () => {
    if (!user) {
      setNotificationError('Sign in first to enable daily stock emails.');
      setShowAuthModal(true);
      return;
    }
    setNotificationSaving(true);
    setNotificationError('');
    setNotificationMessage('');
    try {
      const market = notificationPreference.market;
      const rawEmailTime = normalizeNotificationTimeValue(notificationPreference.email_time);
      const emailTime = isNotificationTimeValid(market, rawEmailTime)
        ? rawEmailTime
        : getSafeNotificationTime(market, rawEmailTime);
      const timeWasAdjusted = emailTime !== rawEmailTime;
      if (timeWasAdjusted) {
        setNotificationPreference(current => ({ ...current, email_time: emailTime }));
      }
      const headers = await getNotificationHeaders();
      const response = await fetch(`${BACKEND}/api/v1/notification-preferences/enable-daily-alerts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...notificationPreference,
          email: user.email,
          email_time: emailTime,
          consent_version: notificationConsentVersion,
          consent_accepted_at: new Date().toISOString(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not enable daily stock emails.');
      const nextPreference = {
        ...DEFAULT_NOTIFICATION_PREFERENCE,
        ...data.preference,
        email_time: getSafeNotificationTime(
          (data.preference?.market as NotificationPreference['market']) || market,
          data.preference?.email_time,
        ),
      } as NotificationPreference;
      setNotificationPreference(nextPreference);
      setShowNotificationConsent(false);
      setShowNotificationSettings(false);
      setNotificationMessage(
        timeWasAdjusted
          ? `Next-trading-day stock signal emails are on. Time adjusted to ${emailTime} IST.`
          : 'Next-trading-day stock signal emails are now on.'
      );
      await loadDailySignalPreview(nextPreference);
    } catch (err: any) {
      setNotificationError(getFriendlyErrorMessage(err, 'Could not enable daily stock emails.'));
    } finally {
      setNotificationSaving(false);
    }
  };

  const disableDailySignals = async () => {
    if (!user) {
      setNotificationError('Sign in first to update daily stock emails.');
      setShowAuthModal(true);
      return;
    }
    setNotificationSaving(true);
    setNotificationError('');
    setNotificationMessage('');
    try {
      const headers = await getNotificationHeaders();
      const response = await fetch(`${BACKEND}/api/v1/notification-preferences/disable-daily-alerts`, {
        method: 'POST',
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Could not disable daily stock emails.');
      setNotificationPreference(current => ({
        ...current,
        ...data.preference,
        daily_stock_email_enabled: false,
      }));
      setNotificationMessage('Next-trading-day stock signal emails are now off.');
    } catch (err: any) {
      setNotificationError(getFriendlyErrorMessage(err, 'Could not disable daily stock emails.'));
    } finally {
      setNotificationSaving(false);
    }
  };

  const toggleDailySignals = async (enabled: boolean) => {
    if (!enabled) {
      await disableDailySignals();
      return;
    }
    const needsConsent = !notificationPreference.consent_accepted_at || notificationPreference.consent_version !== notificationConsentVersion;
    if (needsConsent) {
      setShowNotificationSettings(true);
      setShowNotificationConsent(true);
      return;
    }
    await confirmEnableDailySignals();
  };

  const openDailySignalSettings = () => {
    setShowProfileMenu(false);
    if (user) {
      setShowNotificationSettings(true);
      return;
    }
    setShowAuthModal(true);
  };

  const applyUrlState = (search: string) => {
    const params = new URLSearchParams(search);
    const urlTicker = params.get('ticker');
    const requestedView: DashboardView = params.get('view') === 'details' ? 'details' : 'overview';

    if (!urlTicker) {
      setTicker(null);
      setDashboardView('overview');
      setCachedChart(undefined);
      setCachedAnalysis(undefined);
      setCachedFundamentals(undefined);
      setInput('');
      setShowSuggestions(false);
      return;
    }

    const stock = STOCKS.find(s => s.ticker === urlTicker);
    if (!stock) return;

    const market = resolveMarket(stock.exchange);
    setCachedChart(getCache(`chart:${stock.ticker}:${chartRange}`));
    setCachedAnalysis(getCache(`analysis:${stock.ticker}`));
    setCachedFundamentals(getCache(`fundamentals:${stock.ticker}`));
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setActiveMarket(market);
    setDashboardView(canShowDetailedAnalysis(stock) ? requestedView : 'overview');
  };

  useEffect(() => {
    const search = searchParams.toString();
    applyUrlState(search ? `?${search}` : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const syncCurrentUrl = () => applyUrlState(window.location.search);
    syncCurrentUrl();
    const retryTimer = window.setTimeout(syncCurrentUrl, 250);
    return () => window.clearTimeout(retryTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    expandedTickerRef.current = expandedTicker;
  }, [expandedTicker]);

  useEffect(() => {
    const handlePopState = () => {
      if (expandedTickerRef.current) {
        previewHistoryOpenRef.current = false;
        setExpandedTicker(null);
        setShowProfileMenu(false);
        return;
      }
      applyUrlState(window.location.search);
      setShowProfileMenu(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ticker) {
      setCachedQuote(undefined);
      setCachedChart(undefined);
      setCachedAnalysis(undefined);
      setCachedFundamentals(undefined);
      return;
    }
    setCachedQuote(getCache(`quote:${ticker}`));
    setCachedChart(getCache(`chart:${ticker}:${chartRange}`));
    setCachedAnalysis(getCache(`analysis:${ticker}`));
    setCachedFundamentals(getCache(`fundamentals:${ticker}`));
  }, [ticker, chartRange]);

  const { data: quote } = useSWR(ticker ? `/api/v1/quote/${ticker}` : null, fetcher, {
    fallbackData: cachedQuote,
    refreshInterval: 45000,
    revalidateIfStale: !cachedQuote,
    revalidateOnMount: !cachedQuote,
    revalidateOnFocus: false,
    dedupingInterval: 1000 * 45,
  });
  const { data: chartData, error: chartError } = useSWR(ticker ? `/api/v1/chart/${ticker}?range=${chartRange}` : null, fetcher, {
    fallbackData: cachedChart,
    revalidateIfStale: !cachedChart,
    revalidateOnMount: !cachedChart,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 1000 * 60 * 10,
  });
  const { data: analysis } = useSWR(ticker ? `/api/v1/analyze/${ticker}` : null, fetcher, {
    fallbackData: cachedAnalysis,
    revalidateIfStale: !cachedAnalysis,
    revalidateOnMount: !cachedAnalysis,
    revalidateOnFocus: false,
    dedupingInterval: 1000 * 60 * 10,
  });
  const { data: fundamentals, isLoading: fundamentalsLoading } = useSWR(
    ticker && canOpenDetailedAnalysis ? `/api/v1/fundamentals/${ticker}` : null,
    fetcher,
    {
      fallbackData: cachedFundamentals,
      revalidateIfStale: !cachedFundamentals,
      revalidateOnMount: !cachedFundamentals,
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 1000 * 60 * 30,
    }
  );

  useEffect(() => {
    if (ticker && quote) setCache(`quote:${ticker}`, quote);
  }, [quote, ticker]);

  useEffect(() => {
    if (ticker && chartData) setCache(`chart:${ticker}:${chartRange}`, chartData);
  }, [chartData, chartRange, ticker]);

  useEffect(() => {
    if (ticker && analysis) setCache(`analysis:${ticker}`, analysis);
  }, [analysis, ticker]);

  useEffect(() => {
    if (ticker && fundamentals) setCache(`fundamentals:${ticker}`, fundamentals);
  }, [fundamentals, ticker]);

  useEffect(() => {
    if (input.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = input.trim().toLowerCase();
    const mapped = STOCKS.map(s => {
      const name = s.name.toLowerCase();
      const symbol = s.symbol.toLowerCase();
      const tickerValue = s.ticker.toLowerCase();
      const exactMatch = name.includes(q) || symbol.includes(q) || tickerValue.includes(q) ? 0 : 100;
      const tokenMatch = q.split(/\s+/).every(part => name.includes(part) || symbol.includes(part) || tickerValue.includes(part)) ? 1 : 100;
      const nameDist = getLevenshteinDistance(q, name);
      const symDist = getLevenshteinDistance(q, symbol);
      return { ...s, score: Math.min(exactMatch, tokenMatch, nameDist, symDist) };
    });
    const threshold = Math.max(5, Math.ceil(q.length * 0.45));
    setSuggestions(mapped.filter(s => s.score <= threshold).sort((a, b) => a.score - b.score).slice(0, 8));
    setShowSuggestions(true);
  }, [input]);

  const indicatorPanels = useMemo(
    () => activeIndicators.map(name => buildIndicatorPanel(name, chartData)).filter(Boolean) as IndicatorPanelData[],
    [activeIndicators, chartData]
  );
  const chartRowsAvailable = Array.isArray(chartData) && chartData.some((d: any) => d.date && d.open && d.high && d.low && d.close);

  useEffect(() => {
    if (!ticker || !chartData || !chartRef.current || !Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';
    let cleanup = () => {};
    let cancelled = false;
    import('lightweight-charts').then(({ createChart, CandlestickSeries, LineSeries }) => {
      if (cancelled || !chartRef.current) return;
      const container = chartRef.current;
      const rect = container.getBoundingClientRect();
      const initW = rect.width || container.clientWidth || 800;
      const initH = rect.height || container.clientHeight || 320;
      const indicatorHeight = 190;
      const chart = createChart(container, {
        width: initW,
        height: initH,
        layout: { background: { color: 'transparent' }, textColor: '#475569' },
        grid: { vertLines: { color: 'rgba(15,23,42,0.08)' }, horzLines: { color: 'rgba(15,23,42,0.08)' } },
        crosshair: { mode: 1 },
        timeScale: {
          timeVisible: chartRange === '1d' || chartRange === '1w',
          secondsVisible: false,
          borderColor: 'rgba(15,23,42,0.12)',
          fixLeftEdge: chartRange !== 'max',
          fixRightEdge: true,
          rightOffset: 5,
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444',
        borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444'
      });
      const isIntraday = chartRange === '1d' || chartRange === '1w';
      const formattedData = chartData
        .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
        .map((d: any) => ({
          time: isIntraday
            ? Math.floor(new Date(d.date).getTime() / 1000)
            : d.date?.toString().slice(0, 10),
          open: parseFloat(d.open), high: parseFloat(d.high),
          low: parseFloat(d.low), close: parseFloat(d.close),
        }));
      candleSeries.setData(formattedData);

      const indicatorCharts = indicatorPanels
        .map(panel => {
          const pane = indicatorPaneRefs.current[panel.name];
          if (!pane) return null;
          pane.innerHTML = '';
          const paneRect = pane.getBoundingClientRect();
          const paneWidth = paneRect.width || pane.clientWidth || initW;
          const indicatorChart = createChart(pane, {
            width: paneWidth,
            height: indicatorHeight,
            layout: { background: { color: '#ffffff' }, textColor: '#475569' },
            grid: { vertLines: { color: 'rgba(15,23,42,0.05)' }, horzLines: { color: 'rgba(15,23,42,0.06)' } },
            crosshair: { mode: 1 },
            rightPriceScale: {
              borderColor: 'rgba(15,23,42,0.12)',
              scaleMargins: { top: 0.18, bottom: 0.18 },
            },
            timeScale: {
              timeVisible: chartRange === '1d' || chartRange === '1w',
              secondsVisible: false,
              borderColor: 'rgba(15,23,42,0.12)',
              fixLeftEdge: chartRange !== 'max',
              fixRightEdge: true,
              rightOffset: 5,
            },
          });
          const lineSeries = indicatorChart.addSeries(LineSeries, {
            color: panel.color,
            lineWidth: 2,
            priceLineVisible: true,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
          });
          const panelValues = panel.series;
          const panelTimes = formattedData.slice(-panelValues.length);
          lineSeries.setData(panelValues.map((point, index) => ({
            time: panelTimes[index]?.time,
            value: point.value,
          })).filter((point: any) => point.time !== undefined));
          return { chart: indicatorChart, pane };
        })
        .filter(Boolean) as Array<{ chart: any; pane: HTMLDivElement }>;

      const allCharts = [chart, ...indicatorCharts.map(item => item.chart)];
      let syncingTimeScale = false;
      const syncRange = (sourceChart: any) => (range: any) => {
        if (!range || syncingTimeScale) return;
        syncingTimeScale = true;
        allCharts.forEach(targetChart => {
          if (targetChart !== sourceChart) {
            targetChart.timeScale().setVisibleLogicalRange(range);
          }
        });
        syncingTimeScale = false;
      };
      const mainRangeHandler = syncRange(chart);
      chart.timeScale().subscribeVisibleLogicalRangeChange(mainRangeHandler);
      const indicatorRangeHandlers = indicatorCharts.map(item => {
        const handler = syncRange(item.chart);
        item.chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
        return { item, handler };
      });

      chart.timeScale().fitContent();
      indicatorCharts.forEach(item => item.chart.timeScale().fitContent());
      // Re-fit after layout settles on mobile
      const rafId = requestAnimationFrame(() => {
        if (cancelled || !chartRef.current) return;
        const r = container.getBoundingClientRect();
        if (r.width && r.width !== initW) {
          chart.applyOptions({ width: r.width });
        }
        indicatorCharts.forEach(item => {
          const paneWidth = item.pane.getBoundingClientRect().width || item.pane.clientWidth || r.width || initW;
          item.chart.applyOptions({ width: paneWidth });
        });
        const range = chart.timeScale().getVisibleLogicalRange();
        if (range) indicatorCharts.forEach(item => item.chart.timeScale().setVisibleLogicalRange(range));
      });
      const resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        const w = entry?.contentRect.width || container.clientWidth || 800;
        const h = entry?.contentRect.height || container.clientHeight || 320;
        chart.applyOptions({ width: w, height: h });
        indicatorCharts.forEach(item => {
          const paneWidth = item.pane.getBoundingClientRect().width || item.pane.clientWidth || w;
          item.chart.applyOptions({ width: paneWidth, height: indicatorHeight });
        });
        const range = chart.timeScale().getVisibleLogicalRange();
        if (range) indicatorCharts.forEach(item => item.chart.timeScale().setVisibleLogicalRange(range));
      });
      resizeObserver.observe(container);
      cleanup = () => {
        cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(mainRangeHandler);
        indicatorRangeHandlers.forEach(({ item, handler }) => {
          item.chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
        });
        indicatorCharts.forEach(item => item.chart.remove());
        chart.remove();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [chartData, chartRange, indicatorPanels, ticker, dashboardView]);

  const openStockView = (stock: typeof STOCKS[0], nextView: DashboardView = 'overview') => {
    const market = resolveMarket(stock.exchange);
    const resolvedView = canShowDetailedAnalysis(stock) ? nextView : 'overview';
    setCachedQuote(getCache(`quote:${stock.ticker}`));
    setCachedChart(getCache(`chart:${stock.ticker}:${chartRange}`));
    setCachedAnalysis(getCache(`analysis:${stock.ticker}`));
    setCachedFundamentals(getCache(`fundamentals:${stock.ticker}`));
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setActiveMarket(market);
    setDashboardView(resolvedView);
    setInput('');
    setShowSuggestions(false);
    const nextUrl = resolvedView === 'details'
      ? `/?ticker=${encodeURIComponent(stock.ticker)}&view=details`
      : `/?ticker=${encodeURIComponent(stock.ticker)}`;
    window.history.pushState({ view: 'stock', ticker: stock.ticker, dashboardView: resolvedView }, '', nextUrl);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  };

  const selectStock = (stock: typeof STOCKS[0]) => {
    openStockView(stock, 'overview');
  };

  const selectStockDetails = (stock: typeof STOCKS[0]) => {
    openStockView(stock, 'details');
  };

  const openPreview = (stock: typeof STOCKS[0]) => {
    setExpandedTicker(stock.ticker);
    if (typeof window === 'undefined' || previewHistoryOpenRef.current) return;
    previewHistoryOpenRef.current = true;
    window.history.pushState({ view: 'preview', ticker: stock.ticker }, '', window.location.href);
  };

  const closePreview = () => {
    if (previewHistoryOpenRef.current && typeof window !== 'undefined') {
      previewHistoryOpenRef.current = false;
      window.history.back();
      return;
    }
    setExpandedTicker(null);
  };

  const openDetailedAnalysis = () => {
    if (!selectedStock || !canOpenDetailedAnalysis) return;
    openStockView(selectedStock, 'details');
  };

  const openOverview = () => {
    if (!selectedStock) return;
    openStockView(selectedStock, 'overview');
  };

  const goHome = () => {
    setTicker(null);
    setDashboardView('overview');
    setCachedFundamentals(undefined);
    setShowProfileMenu(false);
    window.history.pushState({ view: 'home' }, '', '/');
  };

  const getMarketStocks = () => {
    if (activeMarket === 'INDIA') {
      return stableMarketShuffle(
        STOCKS.filter(s => s.exchange === 'NSE' || s.exchange === 'BSE').slice(0, STOCK_PAGE_LIMIT),
        'INDIA'
      );
    }
    if (activeMarket === 'US') {
      return stableMarketShuffle(
        STOCKS.filter(s => s.exchange === 'NASDAQ' || s.exchange === 'NYSE').slice(0, STOCK_PAGE_LIMIT),
        'US'
      );
    }
    return [];
  };

  const marketStocks = getMarketStocks();
  const marketPageCount = Math.max(1, Math.ceil(marketStocks.length / STOCKS_PER_PAGE));
  const visibleMarketStocks = marketStocks.slice((marketPage - 1) * STOCKS_PER_PAGE, marketPage * STOCKS_PER_PAGE);
  const visibleQuoteKey = visibleMarketStocks.length
    ? `/api/v1/quotes/batch?tickers=${visibleMarketStocks.map(stock => encodeURIComponent(stock.ticker)).join(',')}`
    : null;
  const marketQuoteCacheKey = `market-quotes:${MARKET_SHUFFLE_VERSION}:${activeMarket}:${marketPage}`;
  const [cachedVisibleQuotes, setCachedVisibleQuotes] = useState<Record<string, QuoteSnapshot> | undefined>(undefined);

  useEffect(() => {
    setCachedVisibleQuotes(getCache<Record<string, QuoteSnapshot>>(marketQuoteCacheKey));
  }, [marketQuoteCacheKey]);

  const { data: visibleQuotes } = useSWR<Record<string, QuoteSnapshot>>(visibleQuoteKey, fetcher, {
    fallbackData: cachedVisibleQuotes,
    refreshInterval: 60000,
    revalidateOnMount: !cachedVisibleQuotes,
    revalidateIfStale: !cachedVisibleQuotes,
    revalidateOnFocus: false,
    dedupingInterval: 1000 * 45,
    onSuccess: quotes => {
      setCache(marketQuoteCacheKey, quotes);
      Object.entries(quotes).forEach(([nextTicker, nextQuote]) => setCache(`quote:${nextTicker}`, nextQuote));
    },
  });

  useEffect(() => {
    const nextPage = marketPage + 1;
    if (nextPage > marketPageCount) return;
    const nextCacheKey = `market-quotes:${MARKET_SHUFFLE_VERSION}:${activeMarket}:${nextPage}`;
    if (getCache<Record<string, QuoteSnapshot>>(nextCacheKey)) return;

    const nextStocks = marketStocks.slice((nextPage - 1) * STOCKS_PER_PAGE, nextPage * STOCKS_PER_PAGE);
    if (!nextStocks.length) return;
    const nextKey = `/api/v1/quotes/batch?tickers=${nextStocks.map(stock => encodeURIComponent(stock.ticker)).join(',')}`;
    let cancelled = false;

    fetcher(nextKey)
      .then((quotes: Record<string, QuoteSnapshot>) => {
        if (cancelled || !quotes) return;
        setCache(nextCacheKey, quotes);
        Object.entries(quotes).forEach(([nextTicker, nextQuote]) => setCache(`quote:${nextTicker}`, nextQuote));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMarket, marketPage, marketPageCount]);

  const assetColumns = Array.from({ length: assetColumnCount }, (_, columnIndex) =>
    visibleMarketStocks.filter((_, stockIndex) => stockIndex % assetColumnCount === columnIndex)
  );

  // ── Prefetch cache: ticker → analysis result ──────────────────────────────
  const [prefetchCache, setPrefetchCache] = useState<Record<string, any>>({});
  const [cachedVisibleAnalysis, setCachedVisibleAnalysis] = useState<Record<string, any> | undefined>(undefined);
  const featuredAnalysisStocks = visibleMarketStocks.slice(0, FEATURED_ANALYSIS_COUNT);
  const visibleAnalysisKey = featuredAnalysisStocks.length
    ? `/api/v1/analyze-batch?tickers=${featuredAnalysisStocks.map(stock => encodeURIComponent(stock.ticker)).join(',')}`
    : null;
  const visibleAnalysisComplete = featuredAnalysisStocks.length > 0
    && featuredAnalysisStocks.every(stock => cachedVisibleAnalysis?.[stock.ticker]);

  useEffect(() => {
    const cachedVisible = visibleMarketStocks.reduce((acc, stock) => {
      const cached = getCache(`analysis:${stock.ticker}`);
      if (cached) acc[stock.ticker] = cached;
      return acc;
    }, {} as Record<string, any>);
    setCachedVisibleAnalysis(Object.keys(cachedVisible).length ? cachedVisible : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMarket, marketPage]);

  useEffect(() => {
    if (!cachedVisibleAnalysis) return;
    const clean: Record<string, any> = {};
    Object.entries(cachedVisibleAnalysis).forEach(([nextTicker, nextAnalysis]) => {
      if (!nextAnalysis || nextAnalysis.error || nextAnalysis.detail) return;
      clean[nextTicker] = nextAnalysis;
      setCache(`analysis:${nextTicker}`, nextAnalysis);
    });
    if (Object.keys(clean).length > 0) {
      setPrefetchCache(prev => ({ ...prev, ...clean }));
    }
  }, [cachedVisibleAnalysis]);

  const { data: visibleAnalysis } = useSWR<Record<string, any>>(visibleAnalysisKey, fetcher, {
    fallbackData: cachedVisibleAnalysis,
    revalidateOnFocus: false,
    dedupingInterval: 1000 * 60 * 10,
    revalidateIfStale: !visibleAnalysisComplete,
    revalidateOnMount: !visibleAnalysisComplete,
    onSuccess: results => {
      const clean: Record<string, any> = {};
      Object.entries(results ?? {}).forEach(([nextTicker, nextAnalysis]) => {
        if (!nextAnalysis || nextAnalysis.error || nextAnalysis.detail) return;
        clean[nextTicker] = nextAnalysis;
        setCache(`analysis:${nextTicker}`, nextAnalysis);
      });
      if (Object.keys(clean).length > 0) {
        setPrefetchCache(prev => ({ ...prev, ...clean }));
      }
    },
  });

  useEffect(() => {
    if (!visibleAnalysis) return;
    const clean: Record<string, any> = {};
    Object.entries(visibleAnalysis).forEach(([nextTicker, nextAnalysis]) => {
      if (!nextAnalysis || nextAnalysis.error || nextAnalysis.detail) return;
      clean[nextTicker] = nextAnalysis;
      setCache(`analysis:${nextTicker}`, nextAnalysis);
    });
    if (Object.keys(clean).length > 0) {
      setPrefetchCache(prev => ({ ...prev, ...clean }));
    }
  }, [visibleAnalysis]);

  // Hydrate visible cards from browser cache first, then refresh visible-page
  // analysis automatically so homepage verdicts match the stock preview.
  useEffect(() => {
    setExpandedTicker(null);
    setMarketPage(1);
    const visibleStocks = getMarketStocks();
    const cachedVisible = visibleStocks.reduce((acc, stock) => {
      const cached = getCache(`analysis:${stock.ticker}`);
      if (cached) acc[stock.ticker] = cached;
      return acc;
    }, {} as Record<string, any>);

    if (Object.keys(cachedVisible).length > 0) {
      setPrefetchCache(prev => ({ ...cachedVisible, ...prev }));
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMarket]);

  useEffect(() => {
    const syncAssetColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) setAssetColumnCount(6);
      else if (width >= 1024) setAssetColumnCount(5);
      else if (width >= 768) setAssetColumnCount(4);
      else if (width >= 640) setAssetColumnCount(3);
      else setAssetColumnCount(2);
    };

    syncAssetColumns();
    window.addEventListener('resize', syncAssetColumns);
    return () => window.removeEventListener('resize', syncAssetColumns);
  }, []);

  const dashboardAnalysisView = getAnalysisPresentation(analysis);
  const isBull = dashboardAnalysisView?.isBullish;
  const isHold = dashboardAnalysisView?.isHold;
  const accentColor = isBull ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : isHold ? 'text-zinc-300' : 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]';
  const previewStock = !ticker && expandedTicker ? STOCKS.find(stock => stock.ticker === expandedTicker) ?? null : null;
  const filteredIndicators = INDICATOR_NAMES.filter(name =>
    name.toLowerCase().includes(indicatorQuery.trim().toLowerCase())
  );
  const toggleIndicator = (name: string) => {
    setActiveIndicators(current =>
      current.includes(name)
        ? current.filter(item => item !== name)
        : [...current, name]
    );
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;500;600&display=swap');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 35s linear infinite; }
        @keyframes dataDrift { 0% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(14px, -10px, 0); } 100% { transform: translate3d(0, 0, 0); } }
        @keyframes scanLine { 0% { transform: translateX(-30%); opacity: 0; } 18%, 72% { opacity: 0.55; } 100% { transform: translateX(130%); opacity: 0; } }
        .bullseye-light {
          background:
            radial-gradient(circle at 16% 8%, rgba(6,182,212,0.22), transparent 30%),
            radial-gradient(circle at 82% 6%, rgba(16,185,129,0.18), transparent 28%),
            linear-gradient(180deg, #f8fcff 0%, #edf7f8 45%, #ffffff 100%);
          color: #0f172a !important;
        }
        .bullseye-light video { display: none; }
        .bullseye-light [class*="bg-black"],
        .bullseye-light [class*="bg-zinc-950"],
        .bullseye-light [class*="bg-zinc-900"] {
          background-color: rgba(255,255,255,0.78) !important;
          backdrop-filter: blur(18px);
        }
        .bullseye-light [class*="border-white"] { border-color: rgba(15,23,42,0.10) !important; }
        .bullseye-light [class*="text-white"],
        .bullseye-light [class*="text-zinc-100"],
        .bullseye-light [class*="text-zinc-200"],
        .bullseye-light [class*="text-zinc-300"] { color: #0f172a !important; }
        .bullseye-light [class*="text-zinc-400"],
        .bullseye-light [class*="text-zinc-500"],
        .bullseye-light [class*="text-zinc-600"] { color: #64748b !important; }
        .bullseye-light .ai-market-panel {
          background-color: rgba(15,23,42,0.96) !important;
          color: #e2e8f0 !important;
        }
        .bullseye-light .ai-market-panel [class*="bg-black"],
        .bullseye-light .ai-market-panel [class*="bg-slate-900"],
        .bullseye-light .ai-market-panel [class*="bg-slate-950"] {
          background-color: rgba(15,23,42,0.84) !important;
        }
        .bullseye-light .ai-market-panel [class*="text-white"],
        .bullseye-light .ai-market-panel [class*="text-zinc-200"],
        .bullseye-light .ai-market-panel [class*="text-zinc-300"],
        .bullseye-light .ai-market-panel [class*="text-slate-100"],
        .bullseye-light .ai-market-panel [class*="text-slate-300"] {
          color: #e2e8f0 !important;
        }
        .bullseye-light .ai-market-panel table [class*="text-slate-"],
        .bullseye-light .ai-market-panel table [class*="text-zinc-"] {
          color: #0f172a !important;
        }
        .bullseye-light .ai-market-panel table [class*="text-green"] { color: #059669 !important; }
        .bullseye-light .ai-market-panel table [class*="text-red"] { color: #dc2626 !important; }
        .bullseye-light .ai-market-panel table [class*="text-cyan"] { color: #0891b2 !important; }
        .bullseye-light .global-news-panel {
          background: rgba(255,255,255,0.82) !important;
          border-color: rgba(8,145,178,0.18) !important;
        }
        .bullseye-light .global-news-heading,
        .bullseye-light .global-news-pill {
          color: #0891b2 !important;
        }
        .bullseye-light .global-news-card {
          background: rgba(15,23,42,0.84) !important;
          border-color: rgba(148,163,184,0.20) !important;
          box-shadow: 0 18px 45px rgba(15,23,42,0.12);
        }
        .bullseye-light .global-news-source { color: #67e8f9 !important; }
        .bullseye-light .global-news-title { color: #f8fafc !important; }
        .bullseye-light .global-news-copy { color: #dbeafe !important; }
        .bullseye-light .stock-news-panel {
          background: rgba(255,255,255,0.94) !important;
          border-color: rgba(100,116,139,0.22) !important;
          box-shadow: 0 20px 60px rgba(15,23,42,0.10) !important;
        }
        .bullseye-light .stock-news-heading {
          color: #475569 !important;
        }
        .bullseye-light .stock-news-card {
          background: rgba(255,255,255,0.92) !important;
          border-color: rgba(100,116,139,0.22) !important;
        }
        .bullseye-light .stock-news-title {
          color: #0f172a !important;
        }
        .bullseye-light input {
          background: rgba(255,255,255,0.92) !important;
          color: #0f172a !important;
          border-color: rgba(8,145,178,0.35) !important;
          box-shadow: 0 12px 40px rgba(15,23,42,0.08);
        }
        .bullseye-light input::placeholder { color: #94a3b8 !important; }
        .bullseye-light .fixed.inset-0.z-0 {
          background: transparent !important;
        }
        .brand-mark {
          box-shadow: 0 16px 40px rgba(8,145,178,0.22), inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .market-visual {
          background-image:
            linear-gradient(120deg, rgba(6,182,212,0.13), transparent 28%, rgba(16,185,129,0.10) 62%, transparent),
            linear-gradient(rgba(8,145,178,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(8,145,178,0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, black 0%, transparent 76%);
        }
        .market-card-float {
          animation: dataDrift 8s ease-in-out infinite;
        }
        .market-scan {
          animation: scanLine 6s ease-in-out infinite;
        }
        .disclaimer-panel {
          background: linear-gradient(135deg, rgba(255,251,235,0.98), rgba(254,243,199,0.92)) !important;
          border-color: rgba(217,119,6,0.34) !important;
          box-shadow: 0 16px 42px rgba(146,64,14,0.10);
        }
        .disclaimer-panel, .disclaimer-panel * {
          color: #78350f !important;
        }
        .force-light-text {
          color: #ffffff !important;
        }
        .stock-view-toggle-active {
          color: #083344 !important;
          background: rgba(207, 250, 254, 0.96) !important;
          border-color: rgba(6, 182, 212, 0.45) !important;
          box-shadow: 0 12px 28px rgba(6, 182, 212, 0.16);
        }
        .stock-view-toggle-idle {
          color: #475569 !important;
          background: rgba(255, 255, 255, 0.72) !important;
          border-color: rgba(148, 163, 184, 0.30) !important;
        }
        /* Active chart range button: preserve white text in light mode */
        .chart-range-btn-active { color: #ffffff !important; }
        /* About description truncation with fade */
        .about-truncated {
          max-height: 88px;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(to bottom, black 45%, transparent 100%);
          mask-image: linear-gradient(to bottom, black 45%, transparent 100%);
        }
        /* Metric card hover lift */
        .metric-card-hover { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .metric-card-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(6,182,212,0.13); }
        /* Animated confidence bar */
        @keyframes barShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .bar-shimmer {
          background: linear-gradient(90deg, #ef4444 0%, #71717a 40%, #4ade80 80%);
          background-size: 200% 100%;
        }
        /* Verdict card glow pulse */
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 18px rgba(74,222,128,0.10); }
          50% { box-shadow: 0 0 32px rgba(74,222,128,0.24); }
        }
        @keyframes glowPulseRed {
          0%, 100% { box-shadow: 0 0 18px rgba(239,68,68,0.10); }
          50% { box-shadow: 0 0 32px rgba(239,68,68,0.24); }
        }
        .verdict-glow-bull { animation: glowPulse 2.8s ease-in-out infinite; }
        .verdict-glow-bear { animation: glowPulseRed 2.8s ease-in-out infinite; }
        /* Chart controls pill */
        .chart-controls-pill { box-shadow: 0 2px 8px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.85); }
        /* Gradient top-border for highlight cards */
        .highlight-card { position: relative; overflow: hidden; }
        .highlight-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, rgba(6,182,212,0.6), rgba(16,185,129,0.4));
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .highlight-card:hover::before { opacity: 1; }
        /* Strategy score bar slightly thicker */
        .strategy-bar { height: 5px; border-radius: 999px; overflow: hidden; }
        /* Market tab active glow line */
        .market-tab-active-india::after {
          content: '';
          position: absolute;
          bottom: 0; left: 10%; right: 10%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(6,182,212,0.8), transparent);
          border-radius: 2px;
        }
        .market-tab-active-us::after {
          content: '';
          position: absolute;
          bottom: 0; left: 10%; right: 10%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(217,70,239,0.8), transparent);
          border-radius: 2px;
        }
        /* Hover glow on strategy rows */
        .strategy-row:hover { background: rgba(6,182,212,0.04) !important; }
        /* Apple-style welcome animation */
        @keyframes welcomeFadeIn {
          0%   { opacity: 0; transform: scale(1.06); }
          18%  { opacity: 1; transform: scale(1); }
          72%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.96); }
        }
        @keyframes welcomeWordIn {
          0%   { opacity: 0; transform: translateY(24px); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0);    filter: blur(0);   }
        }
        @keyframes welcomeWordOut {
          0%   { opacity: 1; transform: translateY(0);     filter: blur(0);   }
          100% { opacity: 0; transform: translateY(-20px); filter: blur(6px); }
        }
        .welcome-overlay {
          animation: welcomeFadeIn 4.2s cubic-bezier(0.22,0.61,0.36,1) forwards;
        }
        .welcome-word {
          display: inline-block;
          animation: welcomeWordIn 0.7s cubic-bezier(0.22,0.61,0.36,1) forwards;
          opacity: 0;
        }
        .welcome-blur {
          margin: 0;
          justify-content: center;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 900;
          letter-spacing: -0.02em;
          line-height: 1;
          font-size: clamp(34px, 7vw, 70px);
        }
        .welcome-blur span {
          background: linear-gradient(135deg, #67e8f9 0%, #22d3ee 45%, #34d399 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
      `}} />

      {/* APPLE-STYLE WELCOME OVERLAY — outside bullseye-light so its CSS doesn't override text colors */}
      {showWelcome && (
        <div
          className="welcome-overlay fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center"
          style={{
            /* Blur the site behind + dark vignette at corners, visible in middle */
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            background: 'radial-gradient(ellipse 75% 65% at 50% 50%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.60) 55%, rgba(0,0,0,0.90) 100%)',
          }}
        >
          {/* Frosted dark card that holds the text — readable on any background */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            userSelect: 'none',
            padding: 'clamp(32px,5vw,56px) clamp(40px,8vw,80px)',
            background: 'rgba(3,7,18,0.82)',
            borderRadius: '32px',
            border: '1px solid rgba(6,182,212,0.14)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 100px rgba(0,0,0,0.55), 0 0 80px rgba(6,182,212,0.07)',
            textAlign: 'center',
            maxWidth: '92vw',
          }}>
            <span
              className="welcome-word"
              style={{
                animationDelay: '0.12s',
                fontSize: '12px',
                letterSpacing: '0.38em',
                textTransform: 'uppercase',
                fontWeight: 400,
                color: '#22d3ee',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Bullseye
            </span>

            <BlurText
              text={`Welcome, ${welcomeName}`}
              animateBy="words"
              direction="top"
              delay={140}
              stepDuration={0.4}
              className="welcome-blur"
            />

            <span
              className="welcome-word"
              style={{
                animationDelay: '1.0s',
                fontSize: '14px',
                color: '#94a3b8',
                fontWeight: 400,
                letterSpacing: '0.04em',
                marginTop: '2px',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Your market intelligence is ready.
            </span>
          </div>
        </div>
      )}

      <div className="bullseye-light min-h-screen overflow-x-hidden text-slate-900 selection:bg-cyan-500/20 selection:text-slate-950 flex flex-col font-['Inter']">

        {/* BACKGROUND */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 market-visual opacity-90" />
          <div className="market-scan absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent blur-xl" />
        </div>

        {/* TICKER TAPE */}
        <div className="relative z-20 w-full bg-black/60 backdrop-blur-xl border-b border-white/10 overflow-hidden py-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <IndexTickerTape />
        </div>

        {/* NAV */}
        <nav className="relative z-20 mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 border-b border-white/5 bg-black/20 px-3 py-3 backdrop-blur-sm sm:gap-3 sm:px-6 sm:py-4 lg:flex-nowrap lg:gap-5">
          <div className="min-w-0 cursor-pointer group shrink-0" onClick={goHome}>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-100 to-emerald-100 sm:h-11 sm:w-11">
                <span className="font-black text-cyan-700 font-['Space_Grotesk'] text-sm sm:text-base">BE</span>
              </div>
              <h1 className="hidden text-xl font-black uppercase tracking-[0.16em] font-['Space_Grotesk'] min-[430px]:block sm:text-3xl sm:tracking-[0.18em]">
                <span className="text-slate-950">BULLS</span><span className="text-cyan-500">EYE</span>
              </h1>
            </div>
            <p className="ml-[52px] mt-1 hidden text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-['Space_Grotesk'] lg:block">
              AI-Powered Market Intelligence
            </p>
          </div>

          <div className="relative order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
            <div className="absolute inset-0 bg-cyan-500/5 rounded-xl blur-lg sm:rounded-2xl"></div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={(e) => { if (e.key === 'Enter' && suggestions.length > 0) selectStock(suggestions[0]); }}
              className="relative z-10 h-11 w-full rounded-xl border border-white/10 bg-black/60 px-3 text-[11px] uppercase tracking-[0.16em] text-white shadow-2xl outline-none transition-all placeholder-zinc-500 hover:border-cyan-500/50 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 sm:h-12 sm:rounded-2xl sm:px-5 sm:text-sm sm:tracking-widest font-['JetBrains_Mono']"
              placeholder="SEARCH ASSETS, NOT HOPE."
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 mt-2 max-h-[72vh] w-full min-w-[min(82vw,320px)] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 bg-black/95 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-3xl sm:min-w-full">
                {suggestions.map((stock) => (
                  <div key={stock.ticker} onMouseDown={() => selectStock(stock)} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 px-3 py-3 transition-all last:border-0 hover:bg-white/5 sm:px-5 sm:py-3.5 group">
                    <span className="min-w-0 truncate font-['Space_Grotesk'] text-xs font-bold uppercase tracking-wide text-zinc-300 group-hover:text-white sm:text-sm sm:tracking-wider" title={stock.name}>{stock.name}</span>
                    <div className="flex min-w-0 max-w-[92px] shrink-0 items-center justify-end gap-1.5 sm:max-w-[140px] sm:gap-2">
                      <span className="rounded bg-white/5 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[8px] uppercase text-zinc-500 sm:px-2 sm:text-[9px]">{stock.exchange}</span>
                      <span className="min-w-0 truncate font-['JetBrains_Mono'] text-[10px] text-cyan-500/70 group-hover:text-cyan-400 sm:text-xs" title={stock.symbol}>{stock.symbol}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/ask-ai"
            onClick={() => setShowProfileMenu(false)}
            className="force-light-text ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-cyan-400/60 bg-gradient-to-r from-cyan-600 to-emerald-500 px-3 text-[10px] font-black uppercase tracking-[0.16em] shadow-[0_12px_32px_rgba(6,182,212,0.28)] transition-all hover:from-cyan-500 hover:to-emerald-400 hover:shadow-[0_14px_38px_rgba(6,182,212,0.4)] sm:h-12 sm:rounded-2xl sm:px-5 sm:text-xs sm:tracking-[0.2em] lg:ml-0"
          >
            <span aria-hidden="true">✦</span>
            Ask AI
          </Link>

          <Link
            href="/screens"
            onClick={() => setShowProfileMenu(false)}
            className="force-light-text inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-900 bg-slate-950 px-3 text-[10px] font-black uppercase tracking-[0.16em] shadow-[0_12px_32px_rgba(15,23,42,0.18)] transition-all hover:border-cyan-500 hover:bg-cyan-600 sm:h-12 sm:rounded-2xl sm:px-5 sm:text-xs sm:tracking-[0.2em]"
          >
            Screener
          </Link>

          {/* Account menu */}
          <div ref={accountMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowProfileMenu(prev => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowProfileMenu(prev => !prev);
                }
              }}
              className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-cyan-200 bg-white text-cyan-700 font-black uppercase shadow-[0_12px_32px_rgba(6,182,212,0.16)] transition-all hover:border-cyan-400 hover:bg-cyan-50 sm:h-12 sm:w-12"
              title={user ? 'Open user dashboard' : 'Open account menu'}
              aria-label={user ? 'Open user dashboard' : 'Open account menu'}
              aria-expanded={showProfileMenu}
            >
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : user ? (
                (user.user_metadata?.full_name || user.email || 'U').slice(0, 1)
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-3 z-50 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_28px_65px_rgba(15,23,42,0.28)] p-4 sm:p-5">
                {authReady && user ? (
                  <>
                    <div className="flex items-center gap-3 border-b border-slate-200 pb-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-cyan-100 text-cyan-700 font-black flex items-center justify-center overflow-hidden shrink-0">
                        {user.user_metadata?.avatar_url ? (
                          <img src={user.user_metadata.avatar_url} alt="avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          (user.user_metadata?.full_name || user.email || 'U').slice(0, 1)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-sm truncate font-['Space_Grotesk']">{user.user_metadata?.full_name || 'Signed in user'}</div>
                        <div className="text-xs text-slate-500 truncate font-['JetBrains_Mono']">{user.email}</div>
                      </div>
                    </div>
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-widest text-cyan-700 font-black font-['Space_Grotesk']">Dashboard</div>
                      <div className="text-xs text-slate-500 mt-1 font-['JetBrains_Mono']">Your signed-in Bullseye workspace</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Market</span>
                        <div className="text-sm font-bold">{activeMarket}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Viewing</span>
                        <div className="text-sm font-bold truncate">{ticker || 'Overview'}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Saved scans</span>
                        <div className="text-sm font-bold">{Object.keys(prefetchCache).length}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Cache</span>
                        <div className="text-sm font-bold">{cachedAnalysis ? 'Ready' : 'Live'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowNotificationSettings(true);
                      }}
                      className="mb-3 w-full rounded-xl border border-cyan-200 bg-cyan-50 py-3 text-xs font-black uppercase tracking-widest text-cyan-700 transition-colors hover:border-cyan-300 hover:bg-cyan-100 font-['Space_Grotesk']"
                    >
                      Logged-in Alerts
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="force-light-text w-full rounded-xl bg-slate-900 py-3 text-xs font-black uppercase tracking-widest font-['Space_Grotesk'] hover:bg-slate-700 transition-colors"
                    >
                      Sign Out
                    </button>
                  </>
                ) : !authReady && supabaseAvailable ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-6">
                    <div className="w-6 h-6 border-2 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-widest text-cyan-700 font-black font-['Space_Grotesk']">Loading Account</div>
                      <div className="text-xs text-slate-500 mt-1 font-['JetBrains_Mono']">Checking your sign-in session...</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-widest text-cyan-700 font-black font-['Space_Grotesk']">Account</div>
                      <div className="text-xs text-slate-500 mt-1 font-['JetBrains_Mono']">Sign in to open your Bullseye dashboard.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowProfileMenu(false); setShowAuthModal(true); }}
                      className="force-light-text w-full rounded-xl bg-slate-900 py-3 text-xs font-black uppercase tracking-widest font-['Space_Grotesk'] hover:bg-slate-700 transition-colors"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* MAIN */}
        <main className="relative z-10 flex-1 w-full min-w-0 max-w-[1600px] mx-auto p-3 sm:p-6 lg:p-8 flex flex-col gap-6">

          {/* ── VIEW 1: DISCOVERY HUB ── */}
          {!ticker && (
            <div className="animate-in fade-in duration-700 w-full flex flex-col gap-6">
              <HomeHero
                activeMarket={activeMarket}
                visibleCount={visibleMarketStocks.length}
                totalCount={marketStocks.length}
                signedIn={Boolean(user)}
                onOpenDailySignals={openDailySignalSettings}
              />

              <MarketSwitcher activeMarket={activeMarket} onMarketChange={setActiveMarket} />

              <MarketScanSection
                activeMarket={activeMarket}
                visibleCount={visibleMarketStocks.length}
                totalCount={marketStocks.length}
                page={marketPage}
                pageCount={marketPageCount}
                columnCount={assetColumnCount}
                onPageChange={(page) => {
                  setMarketPage(page);
                  setExpandedTicker(null);
                }}
              >
                {assetColumns.map((columnStocks, columnIndex) => (
                  <div key={`asset-column-${columnIndex}`} className="flex min-w-0 flex-col gap-4 sm:gap-5">
                    {columnStocks.map(s => (
                      <MarketAssetCard
                        key={s.ticker}
                        stock={s}
                        prefetchedAnalysis={prefetchCache[s.ticker]}
                        quickQuote={visibleQuotes?.[s.ticker]}
                        onPreview={openPreview}
                        onAnalysisReady={(nextTicker, nextAnalysis) =>
                          setPrefetchCache(prev => ({ ...prev, [nextTicker]: nextAnalysis }))
                        }
                      />
                    ))}
                  </div>
                ))}
              </MarketScanSection>

              <DailySignalPreviewCard
                signedIn={Boolean(user)}
                userEmail={user?.email}
                signals={dailySignalPreview}
                isSaving={notificationSaving || notificationLoading}
                error={notificationError}
                message={notificationMessage}
                onOpenSettings={openDailySignalSettings}
                onSendNow={deliveryMode => { void sendNotificationEmailNow(deliveryMode); }}
              />

              <GlobalNewsPanel />

              <HomeFeatureSection onOpenDailySignals={openDailySignalSettings} />
            </div>
          )}

          {/* ── VIEW 2: STOCK DASHBOARD ── */}
          {ticker && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full min-w-0 flex flex-col gap-6">

              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between border-b border-white/10 pb-5 gap-3 relative">
                <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
                <div>
                  <button onClick={goHome}
                    className="text-zinc-400 font-bold uppercase text-[10px] hover:text-cyan-400 transition-colors flex items-center gap-2 tracking-[0.2em] mb-3 bg-white/5 hover:bg-cyan-500/5 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10 hover:border-cyan-400/30">
                    ← Overview
                  </button>
                  <h1 className="break-words font-black text-4xl sm:text-5xl lg:text-6xl text-white uppercase tracking-normal font-['Space_Grotesk'] drop-shadow-[0_2px_20px_rgba(6,182,212,0.2)]">{ticker}</h1>
                  {selectedStock?.name && (
                    <div className="mt-2 text-sm text-zinc-400 font-['JetBrains_Mono'] tracking-wide">{selectedStock.name}</div>
                  )}
                </div>
                <div className="flex flex-col sm:items-end gap-3">
                  {canOpenDetailedAnalysis && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openOverview}
                        className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] font-['Space_Grotesk'] transition-all ${
                          dashboardView === 'overview'
                            ? 'stock-view-toggle-active'
                            : 'stock-view-toggle-idle hover:bg-white'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={openDetailedAnalysis}
                        className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] font-['Space_Grotesk'] transition-all ${
                          dashboardView === 'details'
                            ? 'stock-view-toggle-active'
                            : 'stock-view-toggle-idle hover:bg-white'
                        }`}
                      >
                        Detailed Analysis
                      </button>
                    </div>
                  )}
                {quote?.price && (
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Live Price</div>
                    <span className="text-3xl sm:text-4xl font-['JetBrains_Mono'] font-bold text-white tracking-tight">{currency}{quote.price.toLocaleString()}</span>
                    <div className={`text-sm font-['JetBrains_Mono'] font-bold mt-1 tracking-wider ${quote.change_percent > 0 ? 'text-green-400' : 'text-red-500'}`}>
                      {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                    </div>
                  </div>
                )}
                </div>
              </div>

              {/* Chart + fundamentals snapshot — shown in Overview only. The
                  Detailed Analysis panel renders its own fundamentals/analytics,
                  so these boxes would otherwise duplicate there. */}
              {dashboardView === 'overview' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
              <FundamentalsSnapshotCard
                stock={selectedStock}
                currency={currency}
                fundamentals={fundamentals}
                quote={quote}
                isLoading={fundamentalsLoading}
              />
              <div className="relative order-2 min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_22px_70px_rgba(15,23,42,0.14)] sm:p-5 xl:order-1">
                <div className="flex items-center justify-between gap-3 mb-4 border-b border-slate-200 pb-3 flex-wrap">
                  <span className="font-bold text-xs text-slate-500 uppercase tracking-[0.2em] font-['Space_Grotesk'] flex items-center gap-2 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
                    Chart Geometry
                  </span>
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:gap-3">
                    <div className="chart-controls-pill flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1">
                      {([
                        ['1d',  '1D'],
                        ['1w',  '1W'],
                        ['1mo', '1M'],
                        ['1y',  '1Y'],
                        ['max', 'ALL'],
                      ] as Array<[ChartRange, string]>).map(([range, label]) => (
                        <button
                          key={range}
                          type="button"
                          onClick={() => setChartRange(range)}
                          className={`h-8 min-w-10 rounded-full px-3 text-[10px] font-black font-['JetBrains_Mono'] transition-all duration-200 ${
                            chartRange === range
                              ? range === 'max'
                                ? 'bg-cyan-600 shadow-md chart-range-btn-active ring-1 ring-cyan-500/50'
                                : 'bg-slate-950 shadow-md chart-range-btn-active ring-1 ring-slate-800/50'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowIndicatorMenu(value => !value)}
                        className="h-10 rounded-full border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest text-slate-800 shadow-sm transition-all hover:border-cyan-300 hover:bg-cyan-50 font-['Space_Grotesk']"
                      >
                        Indicators
                      </button>
                      {showIndicatorMenu && (
                        <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowIndicatorMenu(false)} />
                        <div className="fixed left-1/2 top-20 z-50 w-[min(92vw,420px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:translate-x-0">
                          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <div className="text-lg font-black font-['Space_Grotesk']">Indicators</div>
                            <button
                              type="button"
                              onClick={() => setShowIndicatorMenu(false)}
                              className="h-9 w-9 rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
                              aria-label="Close indicators"
                            >
                              X
                            </button>
                          </div>
                          <div className="border-b border-slate-100 p-3">
                            <input
                              value={indicatorQuery}
                              onChange={event => setIndicatorQuery(event.target.value)}
                              placeholder="Search"
                              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white font-['Space_Grotesk']"
                            />
                          </div>
                          <div className="max-h-[min(55vh,420px)] overflow-y-auto py-2">
                            {filteredIndicators.map(name => {
                              const selected = activeIndicators.includes(name);
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => toggleIndicator(name)}
                                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold transition-colors font-['Space_Grotesk'] ${
                                    selected ? 'bg-slate-100 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] ${
                                    selected ? 'border-cyan-400 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-400'
                                  }`}>
                                    {selected ? '+' : ''}
                                  </span>
                                  <span>{name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        </>
                      )}
                    </div>
                    {analysis && !analysis.error && (
                      <span className={`hidden text-xs font-black uppercase tracking-widest font-['Space_Grotesk'] shrink-0 sm:inline ${accentColor}`}>{dashboardAnalysisView?.displayVerdict}</span>
                    )}
                  </div>
                </div>
                {chartError && !chartData ? (
                  <div className="h-[260px] sm:h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50 px-6 text-center font-['JetBrains_Mono'] text-xs text-red-500 sm:text-sm">
                    <div className="mb-2 font-black uppercase tracking-widest text-red-500">Chart unavailable</div>
                    <div>{chartError.message || 'The chart service returned an error. Try again in a moment.'}</div>
                  </div>
                ) : !chartData ? (
                  <div className="h-[260px] sm:h-[360px] flex flex-col items-center justify-center font-['JetBrains_Mono'] text-zinc-500 gap-4 text-xs sm:text-sm uppercase tracking-widest">
                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
                    Loading Data Stream...
                  </div>
                ) : !chartRowsAvailable ? (
                  <div className="h-[260px] sm:h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center font-['JetBrains_Mono'] text-xs text-slate-500 sm:text-sm">
                    <div className="mb-2 font-black uppercase tracking-widest text-slate-700">No chart data</div>
                    <div>The backend did not return candle rows for this symbol yet. Refresh in a moment.</div>
                  </div>
                ) : (
                  <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div ref={chartRef} className="w-full h-[300px] sm:h-[390px] overflow-hidden" />
                    {indicatorPanels.length > 0 && (
                      <div>
                        {indicatorPanels.map(panel => (
                          <IndicatorChartPane
                            key={panel.name}
                            panel={panel}
                            setPaneRef={(name, element) => {
                              indicatorPaneRefs.current[name] = element;
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {indicatorPanels.length === 0 && chartRowsAvailable && (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 font-['JetBrains_Mono']">
                    Select an indicator to add a professional study pane below the stock chart.
                  </div>
                )}
              </div>
              </div>
              )}

              {/* FISO Analysis + all sections in order */}
              {dashboardView === 'details' && selectedStock && canOpenDetailedAnalysis ? (
                <IndiaDetailedAnalysisPanel
                  ticker={ticker}
                  stock={selectedStock}
                  currency={currency}
                  fundamentals={fundamentals}
                  isLoading={fundamentalsLoading && !fundamentals}
                />
              ) : analysis && !analysis.error ? (
                <FisoDetailPanel
                  analysis={analysis}
                  currency={currency}
                  ticker={ticker}
                  chartData={chartData}
                  user={user}
                  getAccessToken={getAccessToken}
                  onRequireAuth={() => setShowAuthModal(true)}
                />
              ) : !analysis && (
                <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
                    <span className="text-xs text-zinc-500 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">Running FISO Algorithm...</span>
                  </div>
                </div>
              )}

              {/* ── DISCLAIMER ── shown after every analysis */}
              {((dashboardView === 'overview' && analysis && !analysis.error) || dashboardView === 'details') && (
                <div className="disclaimer-panel rounded-2xl p-4 flex gap-3">
                  <span className="text-amber-400 text-lg shrink-0 mt-0.5">⚠️</span>
                  <p className="text-[11px] font-['JetBrains_Mono'] leading-relaxed font-semibold">
                    <span className="font-black">Disclaimer: </span>
                    Bullseye is an AI-powered predictive tool and is NOT a SEBI-registered investment advisor.
                    Predictions generated by the app are for educational and informational purposes only,
                    and should not be construed as financial or investment advice. Invest at your own risk.
                  </p>
                </div>
              )}

            </div>
          )}
        </main>
      </div>

      {previewStock && (
        <StockPreviewModal
          stock={previewStock}
          quickQuote={visibleQuotes?.[previewStock.ticker]}
          prefetchedAnalysis={prefetchCache[previewStock.ticker]}
          onClose={closePreview}
          onSelect={(stock) => {
            previewHistoryOpenRef.current = false;
            setExpandedTicker(null);
            selectStock(stock);
          }}
          onAnalysisReady={(nextTicker, nextAnalysis) => {
            setPrefetchCache(prev => ({ ...prev, [nextTicker]: nextAnalysis }));
          }}
        />
      )}

      {/* ── AUTH MODAL ── */}
      {!showNotificationSettings && notificationMessage && (
        <div className="fixed left-1/2 top-5 z-[85] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-emerald-300/30 bg-slate-950/96 px-5 py-4 text-center shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 font-['Space_Grotesk']">
            Logged-in Alerts
          </div>
          <div className="mt-2 text-sm text-emerald-50 font-['JetBrains_Mono']">
            {notificationMessage}
          </div>
        </div>
      )}

      {user && (
        <NotificationSettingsModal
          open={showNotificationSettings}
          userEmail={user.email}
          preference={notificationPreference}
          previewSignals={dailySignalPreview}
          isSaving={notificationSaving}
          error={notificationError}
          message={notificationMessage}
          showConsent={showNotificationConsent}
          onClose={() => {
            setShowNotificationSettings(false);
            setShowNotificationConsent(false);
          }}
          onChange={patch => patchNotificationPreference(patch)}
          onSave={() => { void saveNotificationPreference(); }}
          onSendNow={deliveryMode => { void sendNotificationEmailNow(deliveryMode); }}
          onToggle={enabled => { void toggleDailySignals(enabled); }}
          onConfirmConsent={() => { void confirmEnableDailySignals(); }}
          onCancelConsent={() => setShowNotificationConsent(false)}
        />
      )}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(6,182,212,0.15)]">

            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-600 flex items-center justify-center">
                  <span className="font-black text-black text-sm">B</span>
                </div>
                <h2 className="text-lg font-black text-white tracking-widest uppercase font-['Space_Grotesk']">
                  <span className="text-white">BULLS</span><span className="text-cyan-500">EYE</span>
                </h2>
              </div>
              <p className="mt-3 text-xs font-['JetBrains_Mono'] text-zinc-400">
                Sign in to access Bullseye — markets, screener, Ask AI, and alerts.
              </p>
            </div>

            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-3 rounded-xl mb-4 hover:bg-zinc-100 transition-all disabled:opacity-50 font-['Space_Grotesk']"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/10"></div>
              <span className="text-[10px] text-zinc-600 font-['Space_Grotesk'] uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>

            {/* Tab switcher */}
            <div className="flex bg-white/5 rounded-xl p-1 mb-4">
              {(['signin', 'signup'] as const).map(mode => (
                <button key={mode} onClick={() => { setAuthMode(mode); setAuthError(''); setAuthSuccess(''); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest font-['Space_Grotesk'] transition-all ${
                    authMode === mode ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {/* Email input */}
            <input
              type="email"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              placeholder="Email address"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 placeholder-zinc-600 transition-all mb-3"
            />

            {/* Password input */}
            <input
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
              placeholder="Password"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 placeholder-zinc-600 transition-all mb-4"
            />

            {/* Error / success messages */}
            {authError && <p className="text-red-400 text-xs font-['JetBrains_Mono'] mb-3">{authError}</p>}
            {authSuccess && <p className="text-green-400 text-xs font-['JetBrains_Mono'] mb-3">{authSuccess}</p>}

            {/* Submit button */}
            <button
              onClick={handleEmailAuth}
              disabled={authLoading}
              className="force-light-text w-full bg-slate-950 border border-slate-800 font-bold uppercase tracking-widest text-sm py-3 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-40 font-['Space_Grotesk']"
            >
              {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>

            <p className="text-[9px] text-zinc-600 text-center mt-4 font-['JetBrains_Mono']">
              By signing in you agree that Bullseye is not a SEBI-registered advisor. Invest at your own risk.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

