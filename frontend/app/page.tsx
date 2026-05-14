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
        height: 450,
        layout: { background: { color: 'transparent' }, textColor: '#64748b' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        crosshair: { mode: 1 },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22d3ee', downColor: '#f43f5e', 
        borderVisible: false, wickUpColor: '#22d3ee', wickDownColor: '#f43f5e'
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
  }, [chartData]);

  const selectStock = (stock: typeof STOCKS[0]) => {
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setInput(`${stock.name} (${stock.exchange})`);
    setShowSuggestions(false);
    setSelectedStrategy(null);
  };

  const verdictColor = analysis?.verdict?.includes('Buy') ? 'text-cyan-400 shadow-cyan-400/50' :
    analysis?.verdict === 'Hold' ? 'text-amber-400 shadow-amber-400/50' : 'text-rose-400 shadow-rose-400/50';

  const verdictBg = analysis?.verdict?.includes('Buy') ? 'border-cyan-500/40 bg-cyan-950/20' :
    analysis?.verdict === 'Hold' ? 'border-amber-500/40 bg-amber-950/20' : 'border-rose-500/40 bg-rose-950/20';

  return (
    <div className="min-h-screen bg-[#030305] text-gray-200 selection:bg-cyan-500/30" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
      
      {/* High-Tech Animated Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:2rem_2rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 p-6 md:p-12 max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-16 pt-8 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-md mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-xs font-mono text-cyan-300 tracking-[0.2em] uppercase">System Online // v2.0</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black mb-4 tracking-tighter bg-gradient-to-br from-white via-cyan-100 to-cyan-800 bg-clip-text text-transparent filter drop-shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            QUANTUM.TRADE
          </h1>
          <p className="text-gray-400 text-sm md:text-base font-mono tracking-[0.1em] uppercase max-w-2xl">
            Algorithmic Pattern Recognition & NLP Market Sentiment
          </p>
        </div>

        {/* Global Search Bar */}
        <div className="relative w-full max-w-3xl mx-auto mb-16">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full blur opacity-20"></div>
          <div className="relative">
             <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 px-8 py-5 rounded-full text-xl text-white outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder-gray-600 font-mono"
              placeholder="> INITIALIZE QUERY (e.g., AAPL, Infosys)"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex gap-2">
              <span className="text-gray-600 font-mono text-xs hidden sm:block">PRESS ENTER</span>
            </div>
          </div>
          
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full bg-[#0a0a0c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl mt-4 shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden">
              {suggestions.map((stock, i) => (
                <div key={i} onMouseDown={() => selectStock(stock)}
                  className="flex justify-between items-center px-6 py-4 hover:bg-cyan-500/10 hover:pl-8 cursor-pointer border-b border-white/5 last:border-0 transition-all duration-200">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-100">{stock.name}</span>
                    <span className="text-cyan-500/70 text-xs font-mono">{stock.symbol}</span>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full font-mono bg-white/5 border border-white/10 text-gray-300 backdrop-blur-sm">
                    {stock.exchange}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Display Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          
          {/* Main Chart Terminal */}
          <div className="lg:col-span-8 border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            {/* Terminal Header */}
            <div className="flex justify-between items-end mb-6 border-b border-white/5 pb-4">
              <div>
                <p className="text-cyan-500 text-xs font-mono tracking-widest mb-1 uppercase">Live Data Stream</p>
                <h2 className="text-3xl font-bold text-white tracking-tight">{ticker}</h2>
              </div>
              {quote && quote.price && (
                <div className="text-right">
                  <span className="text-4xl font-mono tracking-tighter text-white">{currency}{quote.price}</span>
                  <div className={`text-lg font-mono flex items-center justify-end gap-1 mt-1 ${quote.change_percent > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                    {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                  </div>
                </div>
              )}
            </div>

            {!chartData ? (
              <div className="h-[450px] flex flex-col items-center justify-center font-mono text-cyan-400/50 gap-4">
                <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                FETCHING MARKET GEOMETRY...
              </div>
            ) : (
              <div ref={chartRef} className="w-full h-[450px]" />
            )}
          </div>

          {/* Right Column: NLP & FISO */}
          <div className="lg:col-span-4 flex flex-col gap-8">
            
            {/* Live NLP Sentiment */}
            <div className="border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px]"></div>
              <h3 className="text-sm font-mono text-purple-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span>
                Global News NLP
              </h3>
              
              <div className="mb-8">
                <span className={`inline-flex px-4 py-2 rounded-xl text-lg font-bold tracking-widest uppercase border ${
                  analysis?.sentiment?.label === 'Bullish' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' :
                  analysis?.sentiment?.label === 'Bearish' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-white/5 border-white/10 text-gray-300'
                }`}>
                  {analysis?.sentiment?.label || 'ANALYZING...'} 
                  <span className="ml-2 opacity-50">[{analysis?.sentiment?.score || 0}]</span>
                </span>
              </div>

              <div className="space-y-4">
                <span className="text-xs text-gray-600 font-mono uppercase tracking-widest block border-b border-white/5 pb-2">Recent Scans</span>
                {analysis?.sentiment?.headlines?.map((headline: string, idx: number) => (
                  <div key={idx} className="text-sm text-gray-400 font-sans leading-relaxed border-l-[3px] border-purple-500/30 pl-4 py-1">
                    {headline}
                  </div>
                ))}
              </div>
            </div>

            {/* FISO Core */}
            {analysis && !analysis.error && (
              <div className={`border backdrop-blur-2xl rounded-[2rem] p-8 flex-1 ${verdictBg} relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[50px]"></div>
                <h3 className="text-sm font-mono text-gray-400 tracking-widest uppercase mb-2">Algorithm Verdict</h3>
                
                <div className={`text-4xl font-black tracking-tight mb-6 ${verdictColor}`}>{analysis.verdict}</div>
                
                <div className="mb-2 flex justify-between items-end">
                   <span className="text-xs font-mono text-gray-500">FISO SCORE</span>
                   <span className="text-3xl font-mono text-white">{analysis.fiso_score}<span className="text-lg text-gray-600">/100</span></span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-2 mb-8 overflow-hidden border border-white/5">
                  <div className={`h-full transition-all duration-1000 ${
                    analysis.fiso_score >= 55 ? 'bg-gradient-to-r from-cyan-600 to-cyan-400' : 
                    analysis.fiso_score >= 40 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'
                  }`} style={{ width: `${analysis.fiso_score}%` }} />
                </div>

                {/* Trade Setup Matrix */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider block mb-1">Entry</span>
                    <p className="text-lg font-mono text-white">{currency}{analysis.entry}</p>
                  </div>
                  <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider block mb-1">Target</span>
                    <p className="text-lg font-mono text-cyan-400">{currency}{analysis.target}</p>
                  </div>
                  <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider block mb-1">Stop Loss</span>
                    <p className="text-lg font-mono text-rose-400">{currency}{analysis.stop_loss}</p>
                  </div>
                  <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider block mb-1">Risk:Reward</span>
                    <p className="text-lg font-mono text-white">{analysis.risk_reward}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tactical Strategy Matrix */}
        {analysis && !analysis.error && (
          <div className="border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-8 lg:p-12 mb-12">
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Tactical Strategy Matrix</h2>
              <p className="text-cyan-500/70 font-mono text-sm uppercase tracking-widest">Validating 20 mathematical models</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-12">
              {STRATEGIES.map((strategy) => (
                <button
                  key={strategy.id}
                  onClick={() => setSelectedStrategy(strategy)}
                  className={`text-left p-5 rounded-2xl border transition-all duration-300 group ${
                    selectedStrategy?.id === strategy.id
                      ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.2)] -translate-y-1'
                      : 'bg-black/30 border-white/5 hover:bg-white/5 hover:border-white/20 hover:-translate-y-1'
                  }`}
                >
                  <span className={`font-mono text-[10px] tracking-widest uppercase block mb-3 transition-colors ${
                    selectedStrategy?.id === strategy.id ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-400'
                  }`}>MODEL {String(strategy.id).padStart(2, '0')}</span>
                  <span className={`font-bold text-sm leading-tight block ${
                     selectedStrategy?.id === strategy.id ? 'text-white' : 'text-gray-300 group-hover:text-white'
                  }`}>{strategy.name}</span>
                </button>
              ))}
            </div>

            {/* Output Console */}
            {selectedStrategy && (
              <div className="bg-[#050508] border border-white/10 rounded-2xl p-8 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                 <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
                    <span className={`px-4 py-1.5 rounded-full font-mono text-xs tracking-widest uppercase font-bold ${
                      analysis.strategy_evals?.[selectedStrategy.id]?.fit === 'STRONG FIT' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                      analysis.strategy_evals?.[selectedStrategy.id]?.fit === 'MODERATE FIT' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {analysis.strategy_evals?.[selectedStrategy.id]?.fit || "AWAITING DATA"}
                    </span>
                    <span className="text-gray-500 font-mono text-sm uppercase">/ {selectedStrategy.name} Analysis</span>
                 </div>
                 <p className="text-lg md:text-xl text-gray-300 leading-relaxed font-light">
                   {analysis.strategy_evals?.[selectedStrategy.id]?.desc || "Synchronizing mathematical evaluation from backend processor..."}
                 </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}