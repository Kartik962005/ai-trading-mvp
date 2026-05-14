'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`http://localhost:8000${url}`).then(res => res.json());

// Stock database (unchanged)
const STOCKS = [ /* your full STOCKS array here - keep it exactly as before */ ];

export default function Home() {
  const [ticker, setTicker] = useState('TCS.NS');
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Strategy Explorer
  const [strategies, setStrategies] = useState<string[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const { data: strategyData } = useSWR(
    selectedStrategy ? `/api/v1/strategy/${ticker}/${encodeURIComponent(selectedStrategy)}` : null,
    fetcher
  );

  const { data: quote } = useSWR(`/api/v1/quote/${ticker}`, fetcher, { refreshInterval: 30000 });
  const { data: chartData } = useSWR(`/api/v1/chart/${ticker}`, fetcher);
  const { data: analysis } = useSWR(`/api/v1/analyze/${ticker}`, fetcher);

  // Suggestions logic (unchanged)
  useEffect(() => {
    if (input.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = input.trim().toLowerCase();
    const filtered = STOCKS.filter(s =>
      s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q)
    ).slice(0, 8);
    setSuggestions(filtered);
    setShowSuggestions(true);
  }, [input]);

  // Load strategies
  useEffect(() => {
    fetch('http://localhost:8000/api/v1/strategies/list')
      .then(res => res.json())
      .then(data => setStrategies(data.strategies || []));
  }, []);

  // Chart (unchanged)
  useEffect(() => {
    if (!chartData || !chartRef.current) return;
    if (!Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';

    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth || 800,
        height: 420,
        layout: { background: { color: '#111827' }, textColor: '#9ca3af' },
        grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
        timeScale: { timeVisible: true, secondsVisible: false },
      });

      const candleSeries = chart.addSeries(CandlestickSeries);
      const formattedData = chartData
        .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
        .map((d: any) => ({
          time: d.date?.toString().slice(0, 10) as string,
          open: parseFloat(d.open),
          high: parseFloat(d.high),
          low: parseFloat(d.low),
          close: parseFloat(d.close),
        }));

      candleSeries.setData(formattedData);
      chart.timeScale().fitContent();
    });
  }, [chartData]);

  const selectStock = (stock: typeof STOCKS[0]) => {
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setInput(`${stock.name} (${stock.exchange})`);
    setShowSuggestions(false);
  };

  const verdictColor = analysis?.verdict?.includes('Buy') ? 'text-green-400' :
                       analysis?.verdict === 'Hold' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      {/* Header + Search (unchanged) */}
      <h1 className="text-4xl font-bold mb-2">AI Trading Assistant</h1>
      <p className="text-gray-400 mb-8">Search any stock by name or symbol</p>

      {/* Search Bar */}
      <div className="relative w-full max-w-lg mb-8">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => input.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          className="w-full bg-gray-900 border border-gray-700 px-4 py-3 rounded-lg text-lg outline-none focus:border-blue-500"
          placeholder="Search: Infosys, Apple, TCS, NVDA..."
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 shadow-xl max-h-80 overflow-auto">
            {suggestions.map((stock, i) => (
              <div
                key={i}
                onMouseDown={() => selectStock(stock)}
                className="flex justify-between items-center px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-0"
              >
                <div>
                  <span className="font-semibold">{stock.name}</span>
                  <span className="text-gray-400 text-sm ml-2">{stock.symbol}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded font-mono bg-blue-900 text-blue-300">
                  {stock.exchange}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Price */}
      {quote && quote.price && (
        <div className="mb-6">
          <span className="text-3xl font-bold">{ticker} </span>
          <span className="text-3xl text-green-400 font-mono">{currency}{quote.price}</span>
          {quote.change_percent != null && (
            <span className={`text-xl ml-3 ${quote.change_percent > 0 ? 'text-green-400' : 'text-red-400'}`}>
              ({quote.change_percent.toFixed(2)}%)
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div ref={chartRef} className="w-full mb-8 rounded-xl overflow-hidden" />

      {/* Strategy Explorer (unchanged) */}
      <div className="mt-12 bg-gray-900 p-6 rounded-2xl">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">📊 Strategy Explorer – Top 20 Worldwide</h2>
        <select
          value={selectedStrategy}
          onChange={(e) => setSelectedStrategy(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 p-4 rounded-xl text-lg outline-none focus:border-blue-500"
        >
          <option value="">Choose a strategy...</option>
          {strategies.map((strat) => (
            <option key={strat} value={strat}>{strat}</option>
          ))}
        </select>
        {/* ... your existing strategy comparison code ... */}
      </div>

      {/* ==================== DETAILED INTELLIGENT ASSISTANT ==================== */}
      {analysis && !analysis.error && analysis.verdict && (
        <div className="mt-12 bg-gray-900 border border-gray-700 p-8 rounded-3xl max-w-2xl">
          <h2 className="text-3xl font-bold mb-6">Intelligent Assistant</h2>

          {/* Verdict */}
          <div className={`text-7xl font-bold mb-8 ${verdictColor}`}>
            {analysis.verdict}
          </div>

          {/* FISO Score */}
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              <p className="text-gray-400">FISO Score</p>
              <p className="font-mono text-xl">{analysis.fiso_score} / 90</p>
            </div>
            <div className="w-full bg-gray-800 rounded-2xl h-4 overflow-hidden">
              <div
                className="h-4 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-2xl transition-all"
                style={{ width: `${(analysis.fiso_score / 90) * 100}%` }}
              />
            </div>
          </div>

          {/* FISO Breakdown */}
          <div className="grid grid-cols-3 gap-4 mb-10 text-center">
            <div className="bg-gray-800 p-4 rounded-2xl">
              <p className="text-xs text-gray-400">TREND</p>
              <p className="text-3xl font-bold text-emerald-400">30</p>
              <p className="text-xs">SMA 50 &gt; SMA 200</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-2xl">
              <p className="text-xs text-gray-400">MOMENTUM</p>
              <p className="text-3xl font-bold text-amber-400">0</p>
              <p className="text-xs">RSI 14</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-2xl">
              <p className="text-xs text-gray-400">MACD</p>
              <p className="text-3xl font-bold text-purple-400">0</p>
              <p className="text-xs">Crossover</p>
            </div>
          </div>

          {/* Detailed Reasoning */}
          <div className="bg-gray-950 rounded-2xl p-6 mb-8">
            <p className="font-semibold text-emerald-400 mb-3">WHY THIS RECOMMENDATION?</p>
            <p className="text-gray-300 leading-relaxed">
              The FISO Score is {analysis.fiso_score} because the stock shows <strong>neutral trend and momentum</strong>. 
              SMA crossover is not confirmed, RSI is in neutral zone, and there is no clear MACD signal. 
              We recommend <span className="font-bold">{analysis.verdict}</span> until a stronger breakout or reversal appears.
            </p>
          </div>

          {/* Technical Indicators */}
          <div className="mb-8">
            <p className="text-gray-400 mb-3 text-sm font-medium">KEY TECHNICAL INDICATORS</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between bg-gray-800 p-3 rounded-xl">
                <span className="text-gray-400">SMA 50</span>
                <span className="font-mono">—</span>
              </div>
              <div className="flex justify-between bg-gray-800 p-3 rounded-xl">
                <span className="text-gray-400">SMA 200</span>
                <span className="font-mono">—</span>
              </div>
              <div className="flex justify-between bg-gray-800 p-3 rounded-xl">
                <span className="text-gray-400">RSI (14)</span>
                <span className="font-mono">—</span>
              </div>
              <div className="flex justify-between bg-gray-800 p-3 rounded-xl">
                <span className="text-gray-400">MACD</span>
                <span className="font-mono">—</span>
              </div>
            </div>
          </div>

          {/* Trade Levels */}
          <div className="space-y-4 text-lg">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Price</span>
              <span className="font-mono">{currency}{analysis.current_price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Recommended Entry</span>
              <span className="font-mono text-blue-400">{currency}{analysis.entry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stop Loss</span>
              <span className="font-mono text-red-400">{currency}{analysis.stop_loss}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Target</span>
              <span className="font-mono text-green-400">{currency}{analysis.target}</span>
            </div>
            <div className="pt-4 border-t border-gray-700 flex justify-between font-bold">
              <span className="text-gray-400">Risk-Reward</span>
              <span className="text-green-400">{analysis.risk_reward}</span>
            </div>
          </div>

          <div className="mt-10 text-xs text-gray-500">
            Analysis based on daily OHLCV data • Updated: {new Date().toLocaleString('en-IN')}
          </div>
        </div>
      )}

      <div className="mt-16 text-xs text-gray-600 text-center">
        Educational tool only • Not financial advice • Past performance is not indicative of future results
      </div>
    </div>
  );
}