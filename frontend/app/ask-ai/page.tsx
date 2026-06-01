'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { STOCKS } from '../stocks';

const BACKEND = '/api/backend';

type Summary = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_return_pct: number;
  avg_return_per_trade_pct: number;
  avg_win_pct?: number;
  avg_loss_pct?: number;
  risk_reward_ratio?: number;
  profit_factor?: number;
  best_trade_pct?: number;
  worst_trade_pct?: number;
  max_drawdown_pct?: number;
  avg_holding_days?: number;
};

type Trade = {
  buy_date: string;
  sell_date: string;
  buy_price: number;
  sell_price: number;
  holding_days: number;
  return_pct: number;
  result: string;
};

type Backtest = {
  buy_expr?: string;
  sell_expr?: string;
  mode?: string;
  current_signal?: string;
  analysis_text?: string;
  summary?: Summary | null;
  trades?: Trade[];
  open_trade?: Record<string, unknown> | null;
  buy_and_hold_return_pct?: number;
  alpha_vs_buy_hold_pct?: number;
  warning?: string;
};

type ScanRow = {
  ticker: string;
  symbol?: string;
  name?: string;
  total_trades: number;
  win_rate: number;
  total_return_pct: number;
  buy_hold_pct: number;
  alpha_pct: number;
};

type Scan = {
  buy_expr?: string;
  sell_expr?: string;
  mode?: string;
  scanned: number;
  traded: number;
  profitable: number;
  beat_buy_hold: number;
  avg_win_rate: number;
  avg_total_return_pct: number;
  rows: ScanRow[];
};

type MoversRow = {
  ticker: string;
  symbol?: string;
  name?: string;
  date: string;
  close: number;
  change_pct: number;
};

type MoversScan = {
  session_date: string | null;
  direction: string;
  coverage: number;
  universe: number;
  ready: boolean;
  rows: MoversRow[];
};

type AskAiResponse = {
  answer: string;
  mode: string;
  success?: boolean;
  model_used: string;
  target_stock: string | null;
  context_used?: boolean;
  backtest: Backtest | null;
  scan: Scan | MoversScan | null;
  suggestions?: string[];
  conversation_id?: string;
  saved?: boolean;
};

type AppContext = {
  current_page: string;
  selected_symbol?: string;
  selected_ticker?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: Partial<AskAiResponse>;
  error?: boolean;
};

type ConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

type StoredConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: Partial<AskAiResponse> | null;
  created_at: string;
};

const EXAMPLES = [
  'Backtest: buy RELIANCE when RSI crosses below 30, sell when it crosses 70',
  'Which NSE stocks perform best with a gap-up momentum strategy?',
  'If I buy TCS 2 days after it falls 5% in a week, then sell on a 3% bounce, does it work?',
  'Explain the difference between a high win rate and an actually profitable strategy',
  'Scan all NSE stocks: golden cross strategy — which ones beat buy-and-hold?',
];

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

function pct(value: number | undefined | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function toneClass(value: number | undefined | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'text-slate-500';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-rose-600';
  return 'text-slate-600';
}

// ── Minimal markdown rendering (no extra deps) ────────────────────────────────
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b-${i}`} className="font-bold text-slate-900">{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code key={`${keyPrefix}-c-${i}`} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-700">
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
    i += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 list-disc space-y-1 pl-5">
        {items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li-${key}-${idx}`)}</li>
        ))}
      </ul>
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
      continue;
    }
    flushBullets();
    if (headingMatch) {
      blocks.push(
        <p key={`h-${key++}`} className="mt-3 mb-1 text-sm font-black uppercase tracking-wide text-slate-900">
          {renderInline(headingMatch[1], `h-${key}`)}
        </p>
      );
    } else if (line.trim() === '') {
      // paragraph spacing handled by margins
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="my-2 leading-relaxed">
          {renderInline(line, `p-${key}`)}
        </p>
      );
    }
  }
  flushBullets();
  return blocks;
}

// ── Result cards ──────────────────────────────────────────────────────────────
function StatCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 transition hover:border-cyan-200 hover:bg-white">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 font-display text-base font-bold tabular-nums ${tone ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function BacktestCard({ data, ticker }: { data: Backtest; ticker: string | null }) {
  const s = data.summary;
  const signal = (data.current_signal || 'HOLD').toUpperCase();
  const signalTone =
    signal === 'BUY' ? 'bg-emerald-100 text-emerald-700' : signal === 'SELL' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600';

  return (
    <div className="mt-3 rounded-2xl border border-cyan-200/70 bg-cyan-50/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-cyan-800">
          Backtest{ticker ? ` · ${ticker}` : ''}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${signalTone}`}>
          Signal: {signal}
        </span>
      </div>

      {(data.buy_expr || data.sell_expr) && (
        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
          {data.buy_expr && <div><span className="font-bold text-emerald-700">BUY</span> <code className="font-mono">{data.buy_expr}</code></div>}
          {data.sell_expr && <div><span className="font-bold text-rose-700">SELL</span> <code className="font-mono">{data.sell_expr}</code></div>}
        </div>
      )}

      {s ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <StatCell label="Trades" value={String(s.total_trades)} />
          <StatCell label="Win rate" value={`${s.win_rate}%`} />
          <StatCell label="Strategy return" value={pct(s.total_return_pct)} tone={toneClass(s.total_return_pct)} />
          <StatCell label="Buy & hold" value={pct(data.buy_and_hold_return_pct)} tone={toneClass(data.buy_and_hold_return_pct)} />
          <StatCell label="Alpha vs B&H" value={pct(data.alpha_vs_buy_hold_pct)} tone={toneClass(data.alpha_vs_buy_hold_pct)} />
          <StatCell label="Avg / trade" value={pct(s.avg_return_per_trade_pct)} tone={toneClass(s.avg_return_per_trade_pct)} />
          <StatCell label="Max drawdown" value={pct(s.max_drawdown_pct)} tone="text-rose-600" />
          <StatCell label="Profit factor" value={s.profit_factor !== undefined ? String(s.profit_factor) : '—'} />
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {data.warning || 'No trades were triggered by this strategy.'}
        </div>
      )}

      {data.trades && data.trades.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-cyan-700 hover:text-cyan-900">
            View last {Math.min(data.trades.length, 12)} trades
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 pr-3 font-bold uppercase">Buy</th>
                  <th className="py-1 pr-3 font-bold uppercase">Sell</th>
                  <th className="py-1 pr-3 font-bold uppercase">Days</th>
                  <th className="py-1 pr-3 font-bold uppercase">Return</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.slice(-12).reverse().map((t, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-1 pr-3 text-slate-600">{t.buy_date} @ {t.buy_price}</td>
                    <td className="py-1 pr-3 text-slate-600">{t.sell_date} @ {t.sell_price}</td>
                    <td className="py-1 pr-3 text-slate-500">{t.holding_days}</td>
                    <td className={`py-1 pr-3 font-bold ${toneClass(t.return_pct)}`}>{pct(t.return_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function ScanCard({ data }: { data: Scan }) {
  return (
    <div className="mt-3 rounded-2xl border border-cyan-200/70 bg-cyan-50/40 p-3 sm:p-4">
      <div className="text-xs font-black uppercase tracking-wider text-cyan-800">Cross-stock scan</div>
      {(data.buy_expr || data.sell_expr) && (
        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
          {data.buy_expr && <div><span className="font-bold text-emerald-700">BUY</span> <code className="font-mono">{data.buy_expr}</code></div>}
          {data.sell_expr && <div><span className="font-bold text-rose-700">SELL</span> <code className="font-mono">{data.sell_expr}</code></div>}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCell label="Scanned" value={String(data.scanned)} />
        <StatCell label="Traded" value={String(data.traded)} />
        <StatCell label="Profitable" value={`${data.profitable}/${data.traded}`} tone="text-emerald-600" />
        <StatCell label="Beat B&H" value={`${data.beat_buy_hold}/${data.traded}`} />
        <StatCell label="Avg return" value={pct(data.avg_total_return_pct)} tone={toneClass(data.avg_total_return_pct)} />
      </div>

      {data.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 pr-3 font-bold uppercase">Stock</th>
                <th className="py-1 pr-3 font-bold uppercase">Return</th>
                <th className="py-1 pr-3 font-bold uppercase">Win %</th>
                <th className="py-1 pr-3 font-bold uppercase">Trades</th>
                <th className="py-1 pr-3 font-bold uppercase">Buy & hold</th>
                <th className="py-1 pr-3 font-bold uppercase">Alpha</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 15).map((r) => (
                <tr key={r.ticker} className="border-t border-slate-100">
                  <td className="py-1 pr-3 font-bold text-slate-700">{r.symbol || r.ticker}</td>
                  <td className={`py-1 pr-3 font-bold ${toneClass(r.total_return_pct)}`}>{pct(r.total_return_pct)}</td>
                  <td className="py-1 pr-3 text-slate-600">{r.win_rate}%</td>
                  <td className="py-1 pr-3 text-slate-500">{r.total_trades}</td>
                  <td className={`py-1 pr-3 ${toneClass(r.buy_hold_pct)}`}>{pct(r.buy_hold_pct)}</td>
                  <td className={`py-1 pr-3 font-bold ${toneClass(r.alpha_pct)}`}>{pct(r.alpha_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MoversCard({ data }: { data: MoversScan }) {
  const isLosers = /declin|loser|lower/i.test(data.direction || '');
  const title = isLosers ? 'Biggest decliners' : 'Biggest gainers';
  return (
    <div className="mt-3 rounded-2xl border border-cyan-200/70 bg-cyan-50/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-cyan-800">
          {title}{data.session_date ? ` · ${data.session_date}` : ''}
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {data.ready ? `${data.universe} stocks scanned` : `scanning ${data.coverage}/${data.universe}`}
        </span>
      </div>

      {data.rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 pr-3 font-bold uppercase">#</th>
                <th className="py-1 pr-3 font-bold uppercase">Stock</th>
                <th className="py-1 pr-3 font-bold uppercase">Change</th>
                <th className="py-1 pr-3 font-bold uppercase">Close</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 15).map((r, idx) => (
                <tr key={r.ticker} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-400 tabular-nums">{idx + 1}</td>
                  <td className="py-1 pr-3 font-bold text-slate-700">{r.symbol || r.ticker}</td>
                  <td className={`py-1 pr-3 font-bold tabular-nums ${toneClass(r.change_pct)}`}>{pct(r.change_pct)}</td>
                  <td className="py-1 pr-3 text-slate-600 tabular-nums">{r.close}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Scanning the full market now — ask again in a moment for the complete ranking.
        </div>
      )}

      {!data.ready && data.rows.length > 0 && (
        <p className="mt-2 text-[10px] text-slate-400">
          Still scanning the full market ({data.coverage}/{data.universe}). Ask again shortly for the complete ranking.
        </p>
      )}
    </div>
  );
}

export default function AskAiPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [appContext, setAppContext] = useState<AppContext>({ current_page: 'ask-ai' });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseAvailable = !!(supabaseUrl && supabaseKey);

  async function getAccessToken() {
    if (!supabaseAvailable) return null;
    const sb = await getSharedSupabaseClient(supabaseUrl!, supabaseKey!);
    if (!sb) return null;
    const result = await sb.auth.getSession();
    return result?.data?.session?.access_token ?? null;
  }

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadConversations() {
    const headers = await authHeaders();
    if (!('Authorization' in headers)) {
      setConversations([]);
      return;
    }
    const response = await fetch(`${BACKEND}/api/v1/ask-ai/conversations`, { headers, cache: 'no-store' });
    if (!response.ok) {
      setConversations([]);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    loadConversations().catch(() => setConversations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up an optional stock the user arrived with (e.g. /ask-ai?ticker=RELIANCE.NS)
  // so answers can use that stock's real context. No-op when none is present.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const symbol = params.get('symbol') ?? undefined;
      const ticker = params.get('ticker') ?? undefined;
      setAppContext({ current_page: 'ask-ai', selected_symbol: symbol, selected_ticker: ticker });
    } catch {
      /* window not available — keep default page-only context */
    }
  }, []);

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const tokenHeaders = await authHeaders();
      const response = await fetch(`${BACKEND}/api/v1/ask-ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tokenHeaders },
        body: JSON.stringify({ prompt: trimmed, history, stocks: STOCKS, context: appContext, conversation_id: conversationId }),
      });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(raw?.detail || 'The AI engine could not answer that. Please try again.');
      }
      const data = raw as AskAiResponse;
      if (data.success === false) {
        throw new Error(data.answer || 'The AI engine is unavailable right now. Please try again shortly.');
      }
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: data.answer || 'No answer returned.', data },
      ]);
      if (data.saved) {
        loadConversations().catch(() => {});
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  async function openConversation(id: string) {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const headers = await authHeaders();
      if (!('Authorization' in headers)) return;
      const response = await fetch(`${BACKEND}/api/v1/ask-ai/conversations/${id}`, { headers, cache: 'no-store' });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(raw?.detail || 'Could not open that chat.');
      }
      const loaded = Array.isArray(raw.messages) ? raw.messages as StoredConversationMessage[] : [];
      setConversationId(id);
      setMessages(loaded.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        data: message.role === 'assistant' && message.data ? message.data : undefined,
      })));
    } finally {
      setHistoryLoading(false);
    }
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
  }

  const isEmpty = messages.length === 0;

  return (
    <main className="relative flex min-h-screen flex-col bg-[#f6fbfd] font-body text-slate-950">
      {/* ambient background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-cyan-200/45 via-sky-100/30 to-emerald-200/35 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-emerald-200/25 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back to the previous page"
              className="group flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 pl-2 pr-3 text-[12px] font-semibold text-slate-600 transition hover:-translate-x-0.5 hover:border-cyan-300 hover:text-cyan-700 hover:shadow-[0_8px_24px_rgba(8,145,178,0.14)]"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 transition group-hover:-translate-x-0.5" aria-hidden="true">
                <path d="M12.5 5L7.5 10l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            <Link href="/" className="group flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/70 bg-gradient-to-br from-white via-cyan-100 to-emerald-100 shadow-[0_6px_18px_rgba(6,182,212,0.18)]">
                <span className="font-display text-xs font-bold text-cyan-700">BE</span>
              </div>
              <div className="leading-tight">
                <div className="font-display text-[15px] font-semibold tracking-tight">
                  <span className="text-slate-900">Ask</span> <span className="text-cyan-600">AI</span>
                </div>
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Backtest · Scan · Explain</div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {!isEmpty && (
              <button
                type="button"
                onClick={startNewChat}
                className="h-9 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-[12px] font-semibold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
              >
                New chat
              </button>
            )}
            <Link
              href="/screens"
              className="h-9 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-[12px] font-semibold leading-9 text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
            >
              Screener
            </Link>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="mx-auto w-full max-w-[1100px] flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {conversations.length > 0 && (
          <aside className="mb-5 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Recent chats</div>
              <button
                type="button"
                onClick={() => loadConversations().catch(() => {})}
                disabled={historyLoading}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-40"
              >
                Refresh
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {conversations.slice(0, 8).map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => openConversation(conversation.id)}
                  disabled={historyLoading}
                  className={`min-w-[180px] max-w-[240px] rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 ${
                    conversation.id === conversationId
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-800'
                  }`}
                >
                  <div className="truncate text-[12px] font-bold">{conversation.title || 'Ask AI chat'}</div>
                  <div className="mt-1 text-[10px] text-slate-400">{new Date(conversation.updated_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </aside>
        )}
        {isEmpty ? (
          <div className="mx-auto max-w-2xl py-8 text-center sm:py-14">
            <div className="animate-rise mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-400 text-3xl text-white shadow-[0_22px_55px_rgba(6,182,212,0.4)]">✦</div>
            <h1 className="animate-rise font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.5rem] sm:leading-[1.1]" style={{ animationDelay: '60ms' }}>
              Ask anything about <span className="bg-gradient-to-r from-cyan-600 to-emerald-500 bg-clip-text text-transparent">the markets</span>
            </h1>
            <p className="animate-rise mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-500" style={{ animationDelay: '120ms' }}>
              Test a trading strategy on our historical data, scan the whole NSE universe, or just ask a question. You
              get an honest, numbers-backed answer — including how the idea stacks up against simply buying and holding.
            </p>
            <div className="mt-8 grid gap-2.5 text-left sm:grid-cols-2">
              {EXAMPLES.map((example, idx) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  style={{ animationDelay: `${160 + idx * 55}ms` }}
                  className="animate-rise group flex items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 text-left text-[13px] leading-snug text-slate-600 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white hover:text-cyan-900 hover:shadow-[0_16px_40px_rgba(8,145,178,0.14)]"
                >
                  <span className="mt-0.5 text-cyan-400 transition group-hover:text-cyan-600" aria-hidden="true">→</span>
                  <span>{example}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <div key={message.id} className={`animate-rise ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start gap-2.5'}`}>
                {message.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-600 to-emerald-500 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-[0_12px_30px_rgba(6,182,212,0.28)]">
                    {message.content}
                  </div>
                ) : (
                  <>
                    <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-400 text-sm text-white shadow-[0_8px_20px_rgba(6,182,212,0.3)] sm:flex" aria-hidden="true">✦</div>
                    <div className="w-full max-w-[92%]">
                      <div
                        className={`rounded-2xl rounded-tl-md border px-4 py-3 text-[14px] shadow-[0_16px_44px_rgba(15,23,42,0.07)] ${
                          message.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-white/70 bg-white/90 text-slate-700 backdrop-blur-sm'
                        }`}
                      >
                      <div className="prose-sm">{renderMarkdown(message.content)}</div>
                      {message.data?.backtest && (
                        <BacktestCard data={message.data.backtest} ticker={message.data.target_stock ?? null} />
                      )}
                      {message.data?.mode === 'movers' && message.data.scan && (
                        <MoversCard data={message.data.scan as MoversScan} />
                      )}
                      {message.data?.mode === 'cross_scan' && message.data.scan && (
                        <ScanCard data={message.data.scan as Scan} />
                      )}
                      {message.data?.model_used && message.data.model_used !== 'local' && (
                        <div className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-300">
                          via {message.data.model_used}
                        </div>
                      )}
                    </div>
                      {message.data?.suggestions && message.data.suggestions.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {message.data.suggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => send(suggestion)}
                              className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 transition hover:border-cyan-300 hover:bg-white hover:text-cyan-700"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start gap-2.5">
                <div className="mt-0.5 hidden h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-400 text-sm text-white sm:flex" aria-hidden="true">✦</div>
                <div className="rounded-2xl rounded-tl-md border border-white/70 bg-white/90 px-4 py-3 text-[14px] text-slate-400 shadow-[0_16px_44px_rgba(15,23,42,0.07)] backdrop-blur-sm">
                  <span className="inline-flex items-center gap-2">
                    Crunching the numbers
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 [animation:dot-bounce_1.2s_ease-in-out_infinite]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 [animation:dot-bounce_1.2s_ease-in-out_0.2s_infinite]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 [animation:dot-bounce_1.2s_ease-in-out_0.4s_infinite]" />
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-[0_18px_48px_rgba(8,145,178,0.12)] transition focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-100/70">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask a question or describe a strategy to backtest…"
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-cyan-600 to-emerald-500 px-4 text-[12px] font-bold uppercase tracking-wider text-white shadow-[0_10px_26px_rgba(6,182,212,0.32)] transition hover:from-cyan-500 hover:to-emerald-400 hover:shadow-[0_12px_30px_rgba(6,182,212,0.42)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              Send
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M4 10h11M10.5 5.5L15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="mt-2.5 text-center text-[10px] text-slate-400">
            Educational analysis on historical data, not financial advice. Past performance does not predict future results.
          </p>
        </div>
      </div>
    </main>
  );
}
