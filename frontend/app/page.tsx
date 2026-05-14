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
  { name: 'Apple', symbol: 'AAPL', exchange: 'NASDAQ', ticker: 'AAPL', currency: '$' },
  { name: 'Microsoft', symbol: 'MSFT', exchange: 'NASDAQ', ticker: 'MSFT', currency: '$' },
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
  const [expandedStrategyId, setExpandedStrategyId] = useState<number | null>(null);
  
  const chartRef = useRef<HTMLDivElement>(null);

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
    setExpandedStrategyId(null);
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
      </div>

      <div className="relative z-10 p-4 sm:p-6 md:p-12 max-w-7xl mx-auto">
        
        {/* Responsive Header */}
        <div className="mb-12 md:mb-16 pt-8 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-md mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-[10px] md:text-xs font-mono text-cyan-300 tracking-[0.2em] uppercase">System Online // v2.0</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black mb-4 tracking-tighter bg-gradient-to-br from-white via-cyan-100 to-cyan-800 bg-clip-text text-transparent filter drop-shadow-[0_0_15px_rgba(34,211,238,0.2)] break-words leading-tight px-2 w-full">
            QUANTUM.TRADE
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm md:text-base font-mono tracking-[0.1em] uppercase max-w-2xl px-4">
            Algorithmic Pattern Recognition & NLP Market Sentiment
          </p>
        </div>

        {/* Global Search Bar */}
        <div className="relative w-full max-w-3xl mx-auto mb-16 px-4 sm:px-0">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full blur opacity-20"></div>
          <div className="relative">
             <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 px-6 sm:px-8 py-4 sm:py-5 rounded-full text-lg sm:text-xl text-white outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder-gray-600 font-mono"
              placeholder="> INIT QUERY (e.g., AAPL)"
            />
          </div>
          
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-[calc(100%-2rem)] sm:w-full mx-4 sm:mx-0 bg-[#0a0a0c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl mt-4 shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden">
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
          <div className="lg:col-span-8 border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-4 sm:p-6 shadow-2xl relative overflow-hidden group">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 border-b border-white/5 pb-4">
              <div className="mb-4 sm:mb-0">
                <p className="text-cyan-500 text-xs font-mono tracking-widest mb-1 uppercase">Live Data Stream</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{ticker}</h2>
              </div>
              {quote && quote.price && (
                <div className="text-left sm:text-right">
                  <span className="text-3xl sm:text-4xl font-mono tracking-tighter text-white">{currency}{quote.price}</span>
                  <div className={`text-sm sm:text-lg font-mono flex items-center justify-start sm:justify-end gap-1 mt-1 ${quote.change_percent > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                    {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                  </div>
                </div>
              )}
            </div>

            {!chartData ? (
              <div className="h-[450px] flex flex-col items-center justify-center font-mono text-cyan-400/50 gap-4">
                <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                FETCHING...
              </div>
            ) : (
              <div ref={chartRef} className="w-full h-[300px] sm:h-[450px]" />
            )}
          </div>

          {/* Right Column: NLP & FISO */}
          <div className="lg:col-span-4 flex flex-col gap-8">
            <div className="border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-6 sm:p-8 relative overflow-hidden">
              <h3 className="text-sm font-mono text-purple-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span>
                Global News NLP
              </h3>
              <div className="mb-6">
                <span className={`inline-flex px-4 py-2 rounded-xl text-sm sm:text-lg font-bold tracking-widest uppercase border ${
                  analysis?.sentiment?.label === 'Bullish' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' :
                  analysis?.sentiment?.label === 'Bearish' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-white/5 border-white/10 text-gray-300'
                }`}>
                  {analysis?.sentiment?.label || 'ANALYZING...'} 
                  <span className="ml-2 opacity-50">[{analysis?.sentiment?.score || 0}]</span>
                </span>
              </div>
              <div className="space-y-4">
                {analysis?.sentiment?.headlines?.map((headline: string, idx: number) => (
                  <div key={idx} className="text-xs sm:text-sm text-gray-400 font-sans leading-relaxed border-l-[3px] border-purple-500/30 pl-4 py-1">
                    {headline}
                  </div>
                ))}
              </div>
            </div>
            
            {/* FISO Core */}
            {analysis && !analysis.error && (
              <div className={`border backdrop-blur-2xl rounded-[2rem] p-6 sm:p-8 flex-1 ${verdictBg} relative overflow-hidden`}>
                <h3 className="text-xs sm:text-sm font-mono text-gray-400 tracking-widest uppercase mb-2">Algorithm Verdict</h3>
                <div className={`text-3xl sm:text-4xl font-black tracking-tight mb-6 ${verdictColor}`}>{analysis.verdict}</div>
                <div className="mb-2 flex justify-between items-end">
                   <span className="text-[10px] sm:text-xs font-mono text-gray-500">FISO SCORE</span>
                   <span className="text-2xl sm:text-3xl font-mono text-white">{analysis.fiso_score}<span className="text-sm sm:text-lg text-gray-600">/100</span></span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-2 mb-8 overflow-hidden border border-white/5">
                  <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-1000" style={{ width: `${analysis.fiso_score}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tactical Strategy Matrix - Fully Interactive UI */}
        {analysis && !analysis.error && (
          <div className="border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-4 sm:p-8 lg:p-12 mb-12">
            <div className="mb-10 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">Tactical Strategy Matrix</h2>
              <p className="text-cyan-500/70 font-mono text-xs sm:text-sm uppercase tracking-widest">Validating 20 mathematical models. Hover/Tap to expand.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
              {STRATEGIES.map((strategy) => {
                const evalData = analysis?.strategy_evals?.[strategy.id];
                const isBest = analysis?.best_strategy_id === strategy.id;
                const isExpanded = expandedStrategyId === strategy.id;

                return (
                  <div
                    key={strategy.id}
                    onMouseEnter={() => setExpandedStrategyId(strategy.id)}
                    onMouseLeave={() => setExpandedStrategyId(null)}
                    onClick={() => setExpandedStrategyId(isExpanded ? null : strategy.id)}
                    className={`relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                      isBest ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border-white/5 hover:border-white/20'
                    } ${
                      isExpanded ? 'bg-black/80 z-20 scale-105' : 'bg-black/30'
                    }`}
                  >
                    {/* Header of Box */}
                    <div className="flex justify-between items-start mb-3">
                      <span className={`font-mono text-[10px] tracking-widest uppercase block ${
                        isBest ? 'text-cyan-400 font-bold' : 'text-gray-500'
                      }`}>MODEL {String(strategy.id).padStart(2, '0')}</span>
                      
                      {/* Mobile Close X button */}
                      {isExpanded && (
                        <button className="sm:hidden text-gray-400 hover:text-white">
                          ✕
                        </button>
                      )}
                    </div>

                    <span className="font-bold text-sm leading-tight block text-white mb-3">{strategy.name}</span>
                    
                    {/* Score inside box */}
                    {evalData && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                           evalData.score > 75 ? 'bg-cyan-500/20 text-cyan-400' : 
                           evalData.score > 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          SCORE: {evalData.score}
                        </span>
                        {isBest && <span className="text-[10px] bg-cyan-400 text-black px-1.5 py-0.5 rounded font-bold uppercase">Best Fit</span>}
                      </div>
                    )}

                    {/* Expanding Content Overlay */}
                    <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100 mt-4 border-t border-white/10 pt-4' : 'max-h-0 opacity-0'}`}>
                      <p className="text-xs text-gray-400 mb-2 font-mono">Overview: {strategy.description}</p>
                      <p className="text-sm text-gray-200 leading-relaxed font-sans border-l-2 border-cyan-500/50 pl-2">
                        {evalData?.desc || "Awaiting mathematical evaluation..."}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}