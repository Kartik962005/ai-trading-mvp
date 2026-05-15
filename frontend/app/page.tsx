'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { STOCKS } from './stocks';

const BACKEND = 'https://ai-trading-backend-jhcl.onrender.com';
const fetcher = (url: string) => fetch(`${BACKEND}${url}`).then(res => res.json());

function getLevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr: number[][] = [];
  for (let i = 0; i <= t.length; i++) { arr[i] = [i]; for (let j = 1; j <= s.length; j++) { arr[i][j] = i === 0 ? j : Math.min(arr[i - 1][j] + 1, arr[i][j - 1] + 1, arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)); } }
  return arr[t.length][s.length];
}

// ─── TICKER TAPE ─────────────────────────────────────────────────────────────
const TickerItem = ({ title, symbol, currency }: { title: string; symbol: string; currency: string }) => {
  const { data } = useSWR(`/api/v1/quote/${symbol}`, fetcher, { refreshInterval: 15000 });
  return (
    <div className="flex items-center gap-4 shrink-0 px-8 border-r border-white/10">
      <span className="font-bold text-xs tracking-widest text-zinc-400 uppercase font-['Space_Grotesk']">{title}</span>
      {data?.price ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-['JetBrains_Mono'] text-white">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.change_percent > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>            {data.change_percent > 0 ? '▲' : '▼'}{Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </div>
      ) : <span className="text-xs text-zinc-600 font-['JetBrains_Mono'] tracking-widest">SYNCING...</span>}
    </div>
  );
};

// ─── MARKET ASSET CARD ────────────────────────────────────────────────────────
const MarketAssetCard = ({ stock, onSelect }: { stock: typeof STOCKS[0]; onSelect: (s: typeof STOCKS[0]) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const lastTap = useRef<number>(0);

  const handleMouseEnter = () => setExpanded(true);
  const handleMouseLeave = () => setExpanded(false);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const now = Date.now();
    const gap = now - lastTap.current;
    lastTap.current = now;
    if (gap < 350 && gap > 0) {
      onSelect(stock);
    } else {
      setExpanded(prev => !prev);
    }
  }, [stock, onSelect]);

  const { data: analysis } = useSWR(expanded ? `/api/v1/analyze/${stock.ticker}` : null, fetcher);
  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const verdictColor = isBull ? 'text-green-400' : isHold ? 'text-zinc-300' : 'text-red-400';
  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchEnd={handleTouchEnd}
      className={`relative p-4 border bg-black/40 backdrop-blur-md rounded-2xl transition-all duration-300 cursor-pointer group flex flex-col justify-start overflow-hidden select-none
        ${expanded ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-white/10 hover:border-cyan-500/50 hover:bg-cyan-900/20'}`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[11px] font-bold font-['JetBrains_Mono'] transition-colors ${expanded ? 'text-cyan-400' : 'text-zinc-500 group-hover:text-cyan-400'}`}>{stock.symbol}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-zinc-400 font-['JetBrains_Mono']">{stock.exchange}</span>
          <span className="md:hidden text-[8px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest">{expanded ? '2×' : 'tap'}</span>
        </div>
      </div>
      <div className="font-bold text-sm text-zinc-200 group-hover:text-white font-['Space_Grotesk'] truncate">{stock.name}</div>

      <div className={`transition-all duration-300 ease-in-out ${expanded ? 'max-h-52 opacity-100 mt-4 border-t border-white/10 pt-4' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        {analysis && !analysis.error ? (
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Verdict</span>
              <span className={`text-sm font-black uppercase tracking-widest ${verdictColor}`}>{analysis.verdict}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">FISO Score</span>
              <span className="text-sm font-['JetBrains_Mono'] text-white font-bold">{analysis.fiso_score}/100</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Confidence</span>
              <span className="text-sm font-['JetBrains_Mono'] text-white font-bold">{analysis.confidence}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Target</span>
              <span className="text-sm font-['JetBrains_Mono'] text-green-400 font-bold">{stock.currency}{analysis.target}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Stop Loss</span>
              <span className="text-sm font-['JetBrains_Mono'] text-red-400 font-bold">{stock.currency}{analysis.stop_loss}</span>
            </div>
            <button
              onMouseDown={() => onSelect(stock)}
              onTouchEnd={(e) => { e.stopPropagation(); onSelect(stock); }}
              className="w-full mt-1 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold uppercase tracking-widest font-['JetBrains_Mono'] hover:bg-cyan-500/20 transition-all"
            >
              Full Analysis →
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
            <span className="text-[10px] text-cyan-500/70 animate-pulse font-['JetBrains_Mono'] tracking-widest">INITIALIZING...</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── DETAILED FISO PANEL ──────────────────────────────────────────────────────
const FisoDetailPanel = ({ analysis, currency, ticker }: { analysis: any; currency: string; ticker: string }) => {
  if (!analysis || analysis.error) return null;

  const isBull = analysis.verdict?.includes('Buy');
  const isHold = analysis.verdict === 'Hold';
  const accentColor = isBull ? 'text-green-400' : isHold ? 'text-zinc-300' : 'text-red-400';
  const accentBg = isBull ? 'bg-green-500/10 border-green-500/30' : isHold ? 'bg-zinc-500/10 border-zinc-500/30' : 'bg-red-500/10 border-red-500/30';
  const accentGlow = isBull ? 'shadow-[0_0_30px_rgba(74,222,128,0.15)]' : isHold ? '' : 'shadow-[0_0_30px_rgba(239,68,68,0.15)]';
  const priceDiff = analysis.target - analysis.entry;
  const pricePct = ((priceDiff / analysis.entry) * 100).toFixed(2);
  const slPct = (((analysis.stop_loss - analysis.entry) / analysis.entry) * 100).toFixed(2);
  const rr = Math.abs(priceDiff / (analysis.stop_loss - analysis.entry)).toFixed(2);

  // AI Backtester state (lifted into FisoDetailPanel so it lives next to the section)
  const [aiPrompt, setAiPrompt] = useState('');
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  const handleCustomBacktest = async () => {
    if (!aiPrompt || !ticker) return;
    setIsBacktesting(true);
    setBacktestResult(null);
    try {
      const res = await fetch(`${BACKEND}/api/v1/backtest/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, prompt: aiPrompt })
      });
      setBacktestResult(await res.json());
    } catch {
      setBacktestResult({ error: "Failed to connect to backend." });
    } finally {
      setIsBacktesting(false);
    }
  };

  // ── Enter key handler for AI backtester input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && aiPrompt.trim() && !isBacktesting) {
      handleCustomBacktest();
    }
  };

  const topStrategies = (analysis?.strategy_evals ?? []).slice(0, 10);

  return (
    <div className="flex flex-col gap-6">

      {/* ── Row 1: Verdict + Score + Key Metrics ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Verdict card */}
        <div className={`lg:col-span-3 rounded-3xl border backdrop-blur-2xl p-6 flex flex-col justify-between ${accentBg} ${accentGlow}`}>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">Algorithm Verdict</span>
            <div className={`text-5xl font-black uppercase tracking-tighter font-['Space_Grotesk'] ${accentColor} mb-4`}>{analysis.verdict}</div>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest block mb-2">Confidence</span>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-['JetBrains_Mono'] font-bold text-white">{analysis.confidence}</span>
              <span className="text-zinc-400 text-lg mb-0.5">%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1 mt-2 overflow-hidden">
              <div className={`h-full rounded-full ${isBull ? 'bg-green-400' : isHold ? 'bg-zinc-400' : 'bg-red-500'}`} style={{ width: `${analysis.confidence}%` }} />
            </div>
          </div>
        </div>

        {/* FISO Score */}
        <div className="lg:col-span-3 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-3">FISO Math Score</span>
          <div>
            <div className="flex items-end gap-1 mb-3">
              <span className="text-5xl font-['JetBrains_Mono'] font-bold text-white">{analysis.fiso_score}</span>
              <span className="text-zinc-600 text-xl mb-1">/100</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden mb-4">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-zinc-400 to-green-400 transition-all duration-1000"
                style={{ width: `${analysis.fiso_score}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {[['0-20', 'Sell'], ['20-40', 'Weak'], ['40-75', 'Hold'], ['75-100', 'Buy']].map(([range, label]) => (
                <div key={label} className={`rounded-lg py-1 text-[8px] font-bold uppercase tracking-widest font-['JetBrains_Mono']
                  ${analysis.fiso_score >= 75 && label === 'Buy' ? 'bg-green-500/30 text-green-400' :
                    analysis.fiso_score >= 40 && analysis.fiso_score < 75 && label === 'Hold' ? 'bg-zinc-500/30 text-zinc-300' :
                    analysis.fiso_score < 40 && (label === 'Sell' || label === 'Weak') ? 'bg-red-500/30 text-red-400' :
                    'bg-white/5 text-zinc-600'}`}>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Price targets */}
        <div className="lg:col-span-6 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-4">Predictive Price Vectors</span>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Entry Price</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-white">{currency}{analysis.entry?.toLocaleString()}</span>
              <span className="text-[9px] text-zinc-500 block mt-1">Current position</span>
            </div>
            <div className="bg-green-500/10 border border-green-400/30 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Target Price</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-green-400">{currency}{analysis.target?.toLocaleString()}</span>
              <span className="text-[9px] text-green-500/70 block mt-1">{priceDiff > 0 ? '+' : ''}{pricePct}% upside</span>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Stop Loss</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-red-400">{currency}{analysis.stop_loss?.toLocaleString()}</span>
              <span className="text-[9px] text-red-500/70 block mt-1">{slPct}% downside</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Risk:Reward</span>
              <span className="text-xl font-['JetBrains_Mono'] font-bold text-white">1 : {rr}</span>
              <span className="text-[9px] text-zinc-500 block mt-1">per unit risk</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Trade Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6">
          <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk'] block mb-4">Trade Timeline</span>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <span className="text-green-400 text-xs font-bold">T</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Target Date</span>
                  <span className="text-[10px] text-zinc-500">{analysis.target_date}</span>
                </div>
              </div>
              <span className="font-['JetBrains_Mono'] text-green-400 font-bold text-sm">{analysis.estimated_days}d</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-zinc-400 text-xs font-bold">⚡</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Expected Move</span>
                  <span className="text-[10px] text-zinc-500">From current price</span>
                </div>
              </div>
              <span className={`font-['JetBrains_Mono'] font-bold text-sm ${priceDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceDiff >= 0 ? '+' : ''}{pricePct}%
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-zinc-400 text-xs font-bold">📊</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Max Risk</span>
                  <span className="text-[10px] text-zinc-500">If stop loss triggered</span>
                </div>
              </div>
              <span className="font-['JetBrains_Mono'] font-bold text-sm text-red-400">{slPct}%</span>
            </div>
          </div>
        </div>

        {/* Spacer column — NLP feed moved to bottom */}
        <div className="lg:col-span-7 bg-black/20 backdrop-blur-2xl border border-white/5 rounded-3xl p-6 flex flex-col justify-center items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-fuchsia-600/20 border border-white/10 flex items-center justify-center">
            <span className="text-xl">🧠</span>
          </div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold font-['Space_Grotesk'] text-center">
            Strategy Intelligence & NLP Feed below
          </span>
          <span className="text-[10px] text-zinc-600 font-['JetBrains_Mono'] text-center">
            Run a backtest · See top 10 strategies · Read the news feed
          </span>
        </div>
      </div>

      {/* ── Section 3: AI Strategy Backtester ── */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        <h3 className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase mb-4 border-b border-white/10 pb-3 font-['Space_Grotesk'] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse inline-block"></span>
          AI Strategy Backtester
        </h3>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. RSI below 30 and volume spike... (press Enter or click Backtest)"
            className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 placeholder-zinc-600 transition-all"
          />
          <button
            onClick={handleCustomBacktest}
            disabled={isBacktesting || !aiPrompt.trim()}
            className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-400 font-bold uppercase tracking-widest text-xs px-6 py-3 rounded-xl hover:bg-cyan-500/30 transition-all disabled:opacity-40 font-['Space_Grotesk'] shrink-0"
          >
            {isBacktesting ? 'Running...' : 'Backtest'}
          </button>
        </div>

        {/* Backtest loading */}
        {isBacktesting && (
          <div className="mt-4 flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin shrink-0"></div>
            <span className="text-xs text-zinc-500 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">
              Running strategy against {analysis.estimated_days * 3}+ days of historical data...
            </span>
          </div>
        )}

        {/* Backtest results */}
        {backtestResult && !isBacktesting && (
          <div className="mt-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {backtestResult.error || backtestResult.custom_metrics?.error ? (
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                <p className="text-red-400 text-sm font-['JetBrains_Mono']">
                  {backtestResult.error || backtestResult.custom_metrics?.error}
                </p>
              </div>
            ) : (
              <>
                {/* 4 metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Total Trades',
                      value: backtestResult.custom_metrics?.total_trades,
                      suffix: '',
                      color: 'text-white',
                      icon: '📈'
                    },
                    {
                      label: 'Win Rate',
                      value: backtestResult.custom_metrics?.win_rate,
                      suffix: '%',
                      color: (backtestResult.custom_metrics?.win_rate ?? 0) >= 50 ? 'text-green-400' : 'text-red-400',                      icon: '🎯'
                    },
                    {
                      label: 'Avg Return / Trade',
                      value: backtestResult.custom_metrics?.avg_return_per_trade_pct,
                      suffix: '%',
                      color: (backtestResult.custom_metrics?.avg_return_per_trade_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                      icon: '⚡'
                    },
                    {
                      label: 'Total Return',
                      value: backtestResult.custom_metrics?.total_return_pct,
                      suffix: '%',
                      color: (backtestResult.custom_metrics?.total_return_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
                      icon: '💰'
                    },
                  ].map(({ label, value, suffix, color, icon }) => (
                    <div key={label} className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{icon}</span>
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold font-['Space_Grotesk']">{label}</span>
                      </div>
                      <span className={`text-xl font-['JetBrains_Mono'] font-bold ${color}`}>
                        {value !== undefined && value !== null ? `${value}${suffix}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Section 4: SignalX Top 10 Recommended Strategies ── */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <span className="font-black text-black font-['Space_Grotesk'] text-sm">X</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-white tracking-widest uppercase font-['Space_Grotesk']">
                Signal<span className="text-cyan-400">X</span> will recommend
              </h3>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-['JetBrains_Mono']">
                Top 10 strategies ranked by signal score · Best fit first
              </span>
            </div>
          </div>
          <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-full font-bold uppercase tracking-widest font-['JetBrains_Mono'] self-start sm:self-auto">
            {topStrategies.length} Active Signals
          </span>
        </div>

        {topStrategies.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-xs text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">Computing signal matrix...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {topStrategies.map((s: any, rank: number) => {
              const isBestFit = rank === 0;
              // Using #4ade80 for strong buy (green) and #f87171 for weak/sell (red)
              const scoreColor = s.score >= 80 ? '#4ade80' : s.score >= 60 ? '#86efac' : s.score >= 40 ? '#fbbf24' : '#f87171';
              return (
                <div
                  key={s.id}
                  className={`relative rounded-2xl p-4 transition-all duration-200 ${
                    isBestFit
                      ? 'bg-gradient-to-r from-cyan-900/30 to-fuchsia-900/10 border border-cyan-400/40 shadow-[0_0_25px_rgba(6,182,212,0.12)]'
                      : 'bg-black/30 border border-white/5 hover:border-white/15 hover:bg-white/3'
                  }`}
                >
                  <div className="flex items-start gap-4">

                    {/* Rank number */}
                    <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm font-['JetBrains_Mono'] ${
                      isBestFit ? 'bg-cyan-400 text-black' : 'bg-white/5 text-zinc-500'
                    }`}>
                      {String(rank + 1).padStart(2, '0')}
                    </div>

                    {/* Main content */}
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

                    {/* Score */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <span className="text-lg font-['JetBrains_Mono'] font-bold" style={{ color: scoreColor }}>
                        {s.score}
                      </span>
                      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, backgroundColor: scoreColor }} />
                      </div>
                      <span className="text-[8px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest">/100</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 5: Global NLP Feed (LAST) ── */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] mb-8">
        <div className="flex justify-between items-center mb-5 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block"></span>
            <span className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk']">Global NLP Feed</span>
          </div>
          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border font-['JetBrains_Mono']
            ${analysis?.sentiment?.label === 'Bullish' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
              analysis?.sentiment?.label === 'Bearish' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
              'bg-white/5 text-zinc-400 border-white/10'}`}>
            {analysis?.sentiment?.label || 'ANALYZING'} [{analysis?.sentiment?.score || 0}]
          </span>
        </div>

        <ul className="space-y-3">
          {analysis?.sentiment?.headlines?.map((h: string, i: number) => (
            <li key={i} className="text-xs text-zinc-300 leading-relaxed border-l-2 border-white/20 pl-4 py-1.5 hover:border-cyan-400 hover:text-white transition-all cursor-pointer group">
              <span className="text-[9px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest block mb-0.5 group-hover:text-cyan-400/70 transition-colors">
                Headline {String(i + 1).padStart(2, '0')}
              </span>
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 inline-block"></span>
          <span className="text-[9px] text-zinc-600 font-['JetBrains_Mono'] uppercase tracking-widest">
            Sentiment derived via NLP · Refreshed on each analysis
          </span>
        </div>
      </div>

    </div>
  );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Home() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeMarket, setActiveMarket] = useState<'INDIA' | 'US' | 'CRYPTO'>('INDIA');
  const chartRef = useRef<HTMLDivElement>(null);

  const { data: quote } = useSWR(ticker ? `/api/v1/quote/${ticker}` : null, fetcher, { refreshInterval: 10000 });
  const { data: chartData } = useSWR(ticker ? `/api/v1/chart/${ticker}` : null, fetcher);
  const { data: analysis } = useSWR(ticker ? `/api/v1/analyze/${ticker}` : null, fetcher);

  useEffect(() => {
    if (input.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = input.trim().toLowerCase();
    const mapped = STOCKS.map(s => {
      const nameDist = getLevenshteinDistance(q, s.name.toLowerCase());
      const symDist = getLevenshteinDistance(q, s.symbol.toLowerCase());
      const exactMatch = s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q) ? 0 : 100;
      return { ...s, score: Math.min(nameDist, symDist, exactMatch) };
    });
    setSuggestions(mapped.filter(s => s.score < 5).sort((a, b) => a.score - b.score).slice(0, 6));
    setShowSuggestions(true);
  }, [input]);

  useEffect(() => {
    if (!ticker || !chartData || !chartRef.current || !Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth || 800,
        height: 320,
        layout: { background: { color: 'transparent' }, textColor: '#71717a' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        crosshair: { mode: 1 },
      });
      
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444',
        borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444'
      });
      const formattedData = chartData
        .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
        .map((d: any) => ({
          time: d.date?.toString().slice(0, 10),
          open: parseFloat(d.open), high: parseFloat(d.high),
          low: parseFloat(d.low), close: parseFloat(d.close),
        }));
      candleSeries.setData(formattedData);
      chart.timeScale().fitContent();
    });
  }, [chartData, ticker]);

  const selectStock = (stock: typeof STOCKS[0]) => {
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setInput('');
    setShowSuggestions(false);
  };

  const getMarketStocks = () => {
    if (activeMarket === 'INDIA') return STOCKS.filter(s => s.exchange === 'NSE' || s.exchange === 'BSE').slice(0, 24);
    if (activeMarket === 'US') return STOCKS.filter(s => s.exchange === 'NASDAQ' || s.exchange === 'NYSE').slice(0, 24);
    if (activeMarket === 'CRYPTO') return STOCKS.filter(s => s.exchange === 'CRYPTO').slice(0, 24);
    return [];
  };

  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const accentColor = isBull ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : isHold ? 'text-zinc-300' : 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]';

  const TickerContent = () => (
    <>
      <TickerItem title="NIFTY 50" symbol="^NSEI" currency="" />
      <TickerItem title="SENSEX" symbol="^BSESN" currency="" />
      <TickerItem title="NASDAQ" symbol="^IXIC" currency="" />
      <TickerItem title="S&P 500" symbol="^GSPC" currency="" />
      <TickerItem title="BITCOIN" symbol="BTC-USD" currency="$" />
      <TickerItem title="ETHEREUM" symbol="ETH-USD" currency="$" />
    </>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;500;600&display=swap');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 35s linear infinite; }
      `}} />

      <div className="min-h-screen text-zinc-200 selection:bg-cyan-500/30 selection:text-white flex flex-col font-['Inter']">

        {/* BACKGROUND */}
        <div className="fixed inset-0 z-0 pointer-events-none bg-black">
          <video autoPlay loop muted playsInline className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto object-cover -translate-x-1/2 -translate-y-1/2 opacity-60 mix-blend-screen">
            <source src="/background.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_10%,_#000000_100%)] opacity-90" />
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        </div>

        {/* TICKER TAPE */}
        <div className="relative z-20 w-full bg-black/60 backdrop-blur-xl border-b border-white/10 overflow-hidden py-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex w-[200%] sm:w-[150%] md:w-full">
            <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0"><TickerContent /></div>
            <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0"><TickerContent /></div>
          </div>
        </div>

        {/* NAV */}
        <nav className="relative z-20 w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-8 max-w-[1600px] mx-auto border-b border-white/5 bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-start cursor-pointer group shrink-0 w-full md:w-auto" onClick={() => setTicker(null)}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                <span className="font-black text-black font-['Space_Grotesk'] text-lg">X</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-[0.2em] uppercase text-white font-['Space_Grotesk']">
                Signal<span className="text-cyan-400">X</span>
              </h1>
            </div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1 ml-[48px] font-['Space_Grotesk'] font-bold hidden sm:block">
              The market heard we exist.
            </p>
          </div>

          <div className="flex-1 w-full max-w-4xl relative">
            <div className="absolute inset-0 bg-cyan-500/5 rounded-2xl blur-lg"></div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={(e) => { if (e.key === 'Enter' && suggestions.length > 0) selectStock(suggestions[0]); }}
              className="relative z-10 w-full bg-black/60 backdrop-blur-2xl border border-white/10 hover:border-cyan-500/50 px-5 sm:px-8 py-4 sm:py-5 rounded-2xl text-sm sm:text-base font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all placeholder-zinc-500 shadow-2xl tracking-widest uppercase"
              placeholder="SEARCH ASSETS. NOT HOPE."
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-black/95 backdrop-blur-3xl border border-white/10 rounded-2xl mt-2 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
                {suggestions.map((stock) => (
                  <div key={stock.ticker} onMouseDown={() => selectStock(stock)} className="flex justify-between items-center px-5 py-3.5 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 group transition-all">
                    <span className="font-bold text-sm text-zinc-300 group-hover:text-white uppercase tracking-wider font-['Space_Grotesk']">{stock.name}</span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-zinc-500 font-['JetBrains_Mono'] uppercase">{stock.exchange}</span>
                      <span className="text-xs font-['JetBrains_Mono'] text-cyan-500/70 group-hover:text-cyan-400">{stock.symbol}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* MAIN */}
        <main className="relative z-10 flex-1 w-full max-w-[1600px] mx-auto p-3 sm:p-6 lg:p-8 flex flex-col gap-6">

          {/* ── VIEW 1: DISCOVERY HUB ── */}
          {!ticker && (
            <div className="animate-in fade-in duration-700 w-full flex flex-col gap-6">

              {/* Mobile hint */}
              <div className="md:hidden bg-cyan-500/5 border border-cyan-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-cyan-400 text-lg">👆</span>
                <div>
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest font-['Space_Grotesk'] block">Mobile Guide</span>
                  <span className="text-[11px] text-zinc-400 font-['JetBrains_Mono']">Single tap = preview · Double tap = full analysis</span>
                </div>
              </div>

              {/* Market tabs */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                {(['INDIA', 'US', 'CRYPTO'] as const).map(market => (
                  <button key={market} onClick={() => setActiveMarket(market)}
                    className={`p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border backdrop-blur-xl transition-all flex flex-col items-start
                      ${activeMarket === market
                        ? market === 'INDIA' ? 'bg-cyan-900/30 border-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]'
                        : market === 'US' ? 'bg-fuchsia-900/30 border-fuchsia-400/50 shadow-[0_0_30px_rgba(217,70,239,0.2)]'
                        : 'bg-zinc-800/50 border-white/50 shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                        : 'bg-black/40 border-white/10 hover:bg-white/5 hover:border-white/30'}`}>
                    <span className={`text-2xl sm:text-4xl mb-2 sm:mb-4 ${activeMarket === market ? 'opacity-100' : 'opacity-40'}`}>
                      {market === 'INDIA' ? '🇮🇳' : market === 'US' ? '🇺🇸' : '₿'}
                    </span>
                    <span className={`text-base sm:text-2xl font-black uppercase tracking-tight font-['Space_Grotesk']
                      ${activeMarket === market ? 'text-white' : 'text-zinc-400'}`}>
                      {market === 'INDIA' ? 'India' : market === 'US' ? 'US' : 'Crypto'}
                    </span>
                    <span className={`text-[9px] sm:text-[10px] font-['JetBrains_Mono'] mt-1 sm:mt-2 uppercase tracking-widest hidden sm:block
                      ${activeMarket === market
                        ? market === 'INDIA' ? 'text-cyan-400' : market === 'US' ? 'text-fuchsia-400' : 'text-white'
                        : 'text-zinc-600'}`}>
                      {market === 'INDIA' ? 'NSE / BSE' : market === 'US' ? 'NASDAQ / NYSE' : 'Digital Assets'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Asset grid */}
              <div className="bg-black/20 backdrop-blur-md rounded-3xl p-4 sm:p-6 border border-white/5 animate-in slide-in-from-bottom-8 fade-in duration-500">
                <div className="flex items-center justify-between mb-4 sm:mb-6 px-2 border-b border-white/10 pb-4">
                  <h2 className="text-xs sm:text-sm font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk']">Live Scan</h2>
                  <span className="text-[10px] bg-white/10 px-3 py-1 rounded-full text-zinc-300 font-['JetBrains_Mono']">{activeMarket}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {getMarketStocks().map(s => (
                    <MarketAssetCard key={s.ticker} stock={s} onSelect={selectStock} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW 2: STOCK DASHBOARD ── */}
          {ticker && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full flex flex-col gap-6">

              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between border-b border-white/10 pb-5 gap-3">
                <div>
                  <button onClick={() => setTicker(null)}
                    className="text-zinc-400 font-bold uppercase text-[10px] hover:text-white transition-colors flex items-center gap-2 tracking-[0.2em] mb-3 bg-white/5 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                    ← Overview
                  </button>
                  <h1 className="font-black text-4xl sm:text-5xl lg:text-6xl text-white uppercase tracking-tighter font-['Space_Grotesk']">{ticker}</h1>
                </div>
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

              {/* Chart */}
              <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                  <span className="font-bold text-xs text-zinc-400 uppercase tracking-[0.2em] font-['Space_Grotesk']">Chart Geometry</span>
                  {analysis && !analysis.error && (
                    <span className={`text-xs font-black uppercase tracking-widest font-['Space_Grotesk'] ${accentColor}`}>{analysis.verdict}</span>
                  )}
                </div>
                {!chartData ? (
                  <div className="h-[260px] sm:h-[320px] flex flex-col items-center justify-center font-['JetBrains_Mono'] text-zinc-500 gap-4 text-xs sm:text-sm uppercase tracking-widest">
                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
                    Loading Data Stream...
                  </div>
                ) : (
                  <div ref={chartRef} className="w-full h-[260px] sm:h-[320px]" />
                )}
              </div>

              {/* FISO Analysis + all sections in order */}
              {analysis && !analysis.error
                ? <FisoDetailPanel analysis={analysis} currency={currency} ticker={ticker} />
                : !analysis && (
                  <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-10 h-10 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
                      <span className="text-xs text-zinc-500 font-['JetBrains_Mono'] uppercase tracking-widest animate-pulse">Running FISO Algorithm...</span>
                    </div>
                  </div>
                )
              }

            </div>
          )}
        </main>
      </div>
    </>
  );
}
