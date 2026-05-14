'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`https://ai-trading-backend-jhcl.onrender.com${url}`).then(res => res.json());

const STOCKS = [
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'NSE', ticker: 'RELIANCE.NS', currency: '₹' },
  { name: 'Tata Consultancy Services', symbol: 'TCS', exchange: 'NSE', ticker: 'TCS.NS', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'NSE', ticker: 'INFY.NS', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'NSE', ticker: 'HDFCBANK.NS', currency: '₹' },
  { name: 'ICICI Bank', symbol: 'ICICIBANK', exchange: 'NSE', ticker: 'ICICIBANK.NS', currency: '₹' },
  { name: 'Wipro', symbol: 'WIPRO', exchange: 'NSE', ticker: 'WIPRO.NS', currency: '₹' },
  { name: 'State Bank of India', symbol: 'SBIN', exchange: 'NSE', ticker: 'SBIN.NS', currency: '₹' },
  { name: 'Apple', symbol: 'AAPL', exchange: 'NASDAQ', ticker: 'AAPL', currency: '$' },
  { name: 'Microsoft', symbol: 'MSFT', exchange: 'NASDAQ', ticker: 'MSFT', currency: '$' },
  { name: 'Google', symbol: 'GOOGL', exchange: 'NASDAQ', ticker: 'GOOGL', currency: '$' },
  { name: 'Tesla', symbol: 'TSLA', exchange: 'NASDAQ', ticker: 'TSLA', currency: '$' },
  { name: 'Nvidia', symbol: 'NVDA', exchange: 'NASDAQ', ticker: 'NVDA', currency: '$' },
];

const STRATEGIES = [
  { id: 1, name: 'Golden Cross', description: 'SMA 50 crosses above SMA 200 — classic long-term bullish signal' },
  { id: 2, name: 'RSI Oversold Bounce', description: 'RSI below 30 signals oversold conditions — potential reversal' },
  { id: 3, name: 'MACD Crossover', description: 'MACD line crosses signal line — momentum shift indicator' },
  { id: 4, name: 'Bollinger Band Breakout', description: 'Price breaks above upper band — strong momentum signal' },
  { id: 5, name: 'Mean Reversion', description: 'Price far from moving average — expects return to mean' },
  { id: 6, name: 'Momentum Trading', description: 'Buy stocks showing strong upward price momentum' },
  { id: 7, name: 'Breakout Trading', description: 'Buy when price breaks key resistance with volume' },
  { id: 8, name: 'Trend Following', description: 'Follow the primary trend using multiple timeframe analysis' },
  { id: 9, name: 'Volume Price Analysis', description: 'Confirms price moves with volume for stronger signals' },
  { id: 10, name: 'Support & Resistance', description: 'Trade bounces off key price levels' },
  { id: 11, name: 'EMA Ribbon', description: 'Multiple EMAs show trend strength and direction' },
  { id: 12, name: 'Stochastic Oscillator', description: 'Compares closing price to price range over time' },
  { id: 13, name: 'ATR Breakout', description: 'Uses Average True Range to identify volatility breakouts' },
  { id: 14, name: 'Inside Bar Pattern', description: 'Consolidation pattern before a major price move' },
  { id: 15, name: 'VWAP Strategy', description: 'Trade relative to Volume Weighted Average Price' },
  { id: 16, name: 'Death Cross Reversal', description: 'SMA 50 crosses below SMA 200 — bearish signal to short' },
  { id: 17, name: 'RSI Divergence', description: 'Price and RSI move in opposite directions — reversal signal' },
  { id: 18, name: 'Gap Fill Strategy', description: 'Stocks tend to fill price gaps — fade the gap open' },
  { id: 19, name: 'Swing High/Low', description: 'Trade between swing highs and lows in a range' },
  { id: 20, name: 'Fibonacci Retracement', description: 'Buy at key Fibonacci levels during a pullback' },
];

export default function Home() {
  const [ticker, setTicker] = useState('TCS.NS');
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<typeof STRATEGIES[0] | null>(null);
  
  const chartRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: quote } = useSWR(`/api/v1/quote/${ticker}`, fetcher, { refreshInterval: 30000 });
  const { data: chartData } = useSWR(`/api/v1/chart/${ticker}`, fetcher);
  const { data: analysis } = useSWR(`/api/v1/analyze/${ticker}`, fetcher);

  useEffect(() => {
    if (input.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = input.trim().toLowerCase();
    const filtered = STOCKS.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.symbol.toLowerCase().includes(q) ||
      s.ticker.toLowerCase().includes(q)
    ).slice(0, 8);
    setSuggestions(filtered);
    setShowSuggestions(true);
  }, [input]);

  useEffect(() => {
    if (!chartData || !chartRef.current || !Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';

    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth || 800,
        height: 400,
        layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
        grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      });

      const candleSeries = chart.addSeries(CandlestickSeries);
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
  }, [chartData]);

  const selectStock = (stock: typeof STOCKS[0]) => {
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setInput(`${stock.name} (${stock.exchange})`);
    setShowSuggestions(false);
    setSelectedStrategy(null);
  };

  const verdictColor = analysis?.verdict?.includes('Buy') ? 'text-cyan-400' :
    analysis?.verdict === 'Hold' ? 'text-amber-400' : 'text-rose-400';

  const verdictBg = analysis?.verdict?.includes('Buy') ? 'border-cyan-500/30 bg-cyan-500/10' :
    analysis?.verdict === 'Hold' ? 'border-amber-500/30 bg-amber-500/10' : 'border-rose-500/30 bg-rose-500/10';

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
      
      {/* Futuristic Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
      </div>

      <div className="relative z-10 p-8 max-w-7xl mx-auto">
        <div className="mb-12 pt-6 text-center">
          <h1 className="text-7xl font-black mb-3 tracking-tighter bg-gradient-to-br from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
            QUANTUM TRADE
          </h1>
          <p className="text-cyan-400 text-sm font-mono tracking-[0.3em] uppercase">Genuine Algorithmic Intelligence</p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full max-w-2xl mx-auto mb-12">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => input.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="w-full bg-white/5 backdrop-blur-md border border-white/10 px-6 py-4 rounded-full text-lg outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-2xl"
            placeholder="Initialize query: Infosys, AAPL, TCS..."
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 w-full bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl mt-2 shadow-2xl overflow-hidden">
              {suggestions.map((stock, i) => (
                <div key={i} onMouseDown={() => selectStock(stock)}
                  className="flex justify-between items-center px-5 py-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0">
                  <div>
                    <span className="font-semibold text-white">{stock.name}</span>
                    <span className="text-gray-500 text-sm ml-2 font-mono">{stock.symbol}</span>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full font-mono bg-white/5 border border-white/10">{stock.exchange}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Price Bar */}
        {quote && quote.price && (
          <div className="flex justify-center items-end gap-6 mb-8">
            <span className="text-5xl font-mono tracking-tighter text-white">{currency}{quote.price}</span>
            <span className={`text-2xl font-mono mb-1 ${quote.change_percent > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
              {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
            </span>
          </div>
        )}

        {/* Chart Container */}
        <div className="bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl mb-12">
          {!chartData ? (
            <div className="h-[400px] flex items-center justify-center font-mono text-cyan-400/50 animate-pulse">Awaiting Data Stream...</div>
          ) : (
            <div ref={chartRef} className="w-full h-[400px]" />
          )}
        </div>

        {/* Dynamic AI Analysis Section */}
        {analysis && !analysis.error && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            
            {/* Left Column: FISO & Technicals */}
            <div className={`col-span-2 border backdrop-blur-xl rounded-3xl p-8 ${verdictBg}`}>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-white tracking-tight">Intelligent Assistant</h2>
                  <p className="text-gray-400 font-mono text-sm mt-1">FISO Score (Fundamental Indicator Strength Oscillator)</p>
                </div>
                <div className={`text-5xl font-black tracking-tighter ${verdictColor}`}>{analysis.verdict}</div>
              </div>

              <div className="flex items-end gap-4 mb-2">
                <span className={`text-6xl font-mono font-black ${verdictColor}`}>{analysis.fiso_score}</span>
                <span className="text-xl text-gray-500 font-mono mb-2">/ 100</span>
              </div>
              
              <div className="w-full bg-black/50 rounded-full h-2 mb-8 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-cyan-500 transition-all duration-1000" style={{ width: `${analysis.fiso_score}%` }} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/20 rounded-2xl p-5 border border-white/5">
                  <span className="text-gray-500 text-xs font-mono uppercase">Entry Node</span>
                  <p className="text-2xl font-mono text-white mt-1">{currency}{analysis.entry}</p>
                </div>
                <div className="bg-black/20 rounded-2xl p-5 border border-white/5">
                  <span className="text-gray-500 text-xs font-mono uppercase">Target Vector</span>
                  <p className="text-2xl font-mono text-cyan-400 mt-1">{currency}{analysis.target}</p>
                </div>
                <div className="bg-black/20 rounded-2xl p-5 border border-white/5">
                  <span className="text-gray-500 text-xs font-mono uppercase">Hard Stop</span>
                  <p className="text-2xl font-mono text-rose-400 mt-1">{currency}{analysis.stop_loss}</p>
                </div>
                <div className="bg-black/20 rounded-2xl p-5 border border-white/5">
                  <span className="text-gray-500 text-xs font-mono uppercase">R:R Ratio</span>
                  <p className="text-2xl font-mono text-white mt-1">{analysis.risk_reward}</p>
                </div>
              </div>
            </div>

            {/* Right Column: Live NLP Sentiment */}
            <div className="border border-white/10 bg-white/[0.02] backdrop-blur-xl rounded-3xl p-8">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <span className="text-purple-400">⚡</span> Global News Sentiment
              </h3>
              
              <div className="mb-6">
                <span className="text-sm text-gray-500 font-mono uppercase block mb-2">Algorithm Reading</span>
                <span className={`px-4 py-2 rounded-full text-sm font-bold tracking-widest uppercase ${
                  analysis.sentiment.label === 'Bullish' ? 'bg-cyan-500/20 text-cyan-400' :
                  analysis.sentiment.label === 'Bearish' ? 'bg-rose-500/20 text-rose-400' : 'bg-gray-500/20 text-gray-300'
                }`}>
                  {analysis.sentiment.label} ({analysis.sentiment.score})
                </span>
              </div>

              <div className="space-y-4">
                <span className="text-sm text-gray-500 font-mono uppercase block">Latest NLP Scans</span>
                {analysis.sentiment.headlines.map((headline: string, idx: number) => (
                  <div key={idx} className="text-sm text-gray-300 border-l-2 border-white/10 pl-3">
                    {headline}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Genuine Backtesting Section */}
        {analysis && !analysis.error && (
          <div className="border border-white/10 bg-white/[0.02] backdrop-blur-xl rounded-3xl p-8 mb-12">
            <h2 className="text-2xl font-bold text-white mb-2">Live Strategy Backtester</h2>
            <p className="text-gray-500 mb-8 font-mono text-sm">Validating 20 technical models against current chart data.</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {STRATEGIES.map((strategy) => (
                <button
                  key={strategy.id}
                  onClick={() => setSelectedStrategy(strategy)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    selectedStrategy?.id === strategy.id
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                      : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  <span className="font-mono text-xs opacity-50 block mb-2">MODEL {String(strategy.id).padStart(2, '0')}</span>
                  <span className="font-semibold text-sm leading-tight block">{strategy.name}</span>
                </button>
              ))}
            </div>

            {selectedStrategy && (
              <div className="bg-black/40 border border-white/10 rounded-2xl p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <span className="px-3 py-1 bg-white/10 rounded-full font-mono text-xs tracking-wider">
                      {analysis.strategy_evals[selectedStrategy.id]?.fit || "NO FIT DATA"}
                    </span>
                 </div>
                 <p className="text-lg text-gray-300 leading-relaxed">
                   {analysis.strategy_evals[selectedStrategy.id]?.desc || "Waiting on backend mathematical evaluation..."}
                 </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}