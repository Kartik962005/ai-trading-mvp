'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`https://ai-trading-backend-jhcl.onrender.com${url}`).then(res => res.json());

const STOCKS = [
  // NSE
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'NSE', ticker: 'RELIANCE.NS', currency: '₹' },
  { name: 'Tata Consultancy Services', symbol: 'TCS', exchange: 'NSE', ticker: 'TCS.NS', currency: '₹' },
  { name: 'Tata Motors (Commercial)', symbol: 'TATAMOTORS', exchange: 'NSE', ticker: 'TATAMOTORS.NS', currency: '₹' },
  { name: 'Tata Motors (TMPV)', symbol: 'TMPV', exchange: 'NSE', ticker: 'TATAMTRDVR.NS', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'NSE', ticker: 'HDFCBANK.NS', currency: '₹' },
  { name: 'ICICI Bank', symbol: 'ICICIBANK', exchange: 'NSE', ticker: 'ICICIBANK.NS', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'NSE', ticker: 'INFY.NS', currency: '₹' },
  { name: 'Wipro', symbol: 'WIPRO', exchange: 'NSE', ticker: 'WIPRO.NS', currency: '₹' },
  { name: 'State Bank of India', symbol: 'SBIN', exchange: 'NSE', ticker: 'SBIN.NS', currency: '₹' },
  { name: 'Bajaj Finance', symbol: 'BAJFINANCE', exchange: 'NSE', ticker: 'BAJFINANCE.NS', currency: '₹' },
  { name: 'Adani Enterprises', symbol: 'ADANIENT', exchange: 'NSE', ticker: 'ADANIENT.NS', currency: '₹' },
  { name: 'ITC', symbol: 'ITC', exchange: 'NSE', ticker: 'ITC.NS', currency: '₹' },
  { name: 'Larsen & Toubro', symbol: 'LT', exchange: 'NSE', ticker: 'LT.NS', currency: '₹' },
  { name: 'Bharti Airtel', symbol: 'BHARTIARTL', exchange: 'NSE', ticker: 'BHARTIARTL.NS', currency: '₹' },
  { name: 'Asian Paints', symbol: 'ASIANPAINT', exchange: 'NSE', ticker: 'ASIANPAINT.NS', currency: '₹' },
  // BSE
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'BSE', ticker: '500325.BO', currency: '₹' },
  { name: 'Tata Consultancy Services', symbol: 'TCS', exchange: 'BSE', ticker: '532540.BO', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'BSE', ticker: '500209.BO', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'BSE', ticker: '500180.BO', currency: '₹' },
  { name: 'ICICI Bank', symbol: 'ICICIBANK', exchange: 'BSE', ticker: '532174.BO', currency: '₹' },
  // US
  { name: 'Apple', symbol: 'AAPL', exchange: 'NASDAQ', ticker: 'AAPL', currency: '$' },
  { name: 'Microsoft', symbol: 'MSFT', exchange: 'NASDAQ', ticker: 'MSFT', currency: '$' },
  { name: 'Google', symbol: 'GOOGL', exchange: 'NASDAQ', ticker: 'GOOGL', currency: '$' },
  { name: 'Amazon', symbol: 'AMZN', exchange: 'NASDAQ', ticker: 'AMZN', currency: '$' },
  { name: 'Tesla', symbol: 'TSLA', exchange: 'NASDAQ', ticker: 'TSLA', currency: '$' },
  { name: 'Nvidia', symbol: 'NVDA', exchange: 'NASDAQ', ticker: 'NVDA', currency: '$' },
  { name: 'Meta', symbol: 'META', exchange: 'NASDAQ', ticker: 'META', currency: '$' },
  { name: 'Netflix', symbol: 'NFLX', exchange: 'NASDAQ', ticker: 'NFLX', currency: '$' },
  { name: 'AMD', symbol: 'AMD', exchange: 'NASDAQ', ticker: 'AMD', currency: '$' },
  { name: 'Intel', symbol: 'INTC', exchange: 'NASDAQ', ticker: 'INTC', currency: '$' },
  // CRYPTO
  { name: 'Bitcoin', symbol: 'BTC', exchange: 'CRYPTO', ticker: 'BTC-USD', currency: '$' },
  { name: 'Ethereum', symbol: 'ETH', exchange: 'CRYPTO', ticker: 'ETH-USD', currency: '$' },
  { name: 'Solana', symbol: 'SOL', exchange: 'CRYPTO', ticker: 'SOL-USD', currency: '$' },
  { name: 'Ripple', symbol: 'XRP', exchange: 'CRYPTO', ticker: 'XRP-USD', currency: '$' },
  { name: 'Cardano', symbol: 'ADA', exchange: 'CRYPTO', ticker: 'ADA-USD', currency: '$' },
  { name: 'Dogecoin', symbol: 'DOGE', exchange: 'CRYPTO', ticker: 'DOGE-USD', currency: '$' },
  { name: 'Binance Coin', symbol: 'BNB', exchange: 'CRYPTO', ticker: 'BNB-USD', currency: '$' },
  { name: 'Chainlink', symbol: 'LINK', exchange: 'CRYPTO', ticker: 'LINK-USD', currency: '$' },
  { name: 'Polkadot', symbol: 'DOT', exchange: 'CRYPTO', ticker: 'DOT-USD', currency: '$' },
  { name: 'Polygon', symbol: 'MATIC', exchange: 'CRYPTO', ticker: 'MATIC-USD', currency: '$' },
];

const STRATEGIES = [
  { id: 1,  name: 'Golden Cross',           description: 'SMA 50 crosses above SMA 200 — classic long-term bullish signal' },
  { id: 2,  name: 'RSI Oversold Bounce',    description: 'RSI below 30 signals oversold conditions — potential reversal' },
  { id: 3,  name: 'MACD Crossover',         description: 'MACD line crosses signal line — momentum shift indicator' },
  { id: 4,  name: 'Bollinger Band Breakout',description: 'Price breaks above upper band — strong momentum signal' },
  { id: 5,  name: 'Mean Reversion',         description: 'Price far from moving average — expects return to mean' },
  { id: 6,  name: 'Momentum Trading',       description: 'Buy stocks showing strong upward price momentum' },
  { id: 7,  name: 'Breakout Trading',       description: 'Buy when price breaks key resistance with volume' },
  { id: 8,  name: 'Trend Following',        description: 'Follow the primary trend using multiple timeframe analysis' },
  { id: 9,  name: 'Volume Price Analysis',  description: 'Confirms price moves with volume for stronger signals' },
  { id: 10, name: 'Support & Resistance',   description: 'Trade bounces off key price levels' },
  { id: 11, name: 'EMA Ribbon',             description: 'Multiple EMAs show trend strength and direction' },
  { id: 12, name: 'Stochastic Oscillator',  description: 'Compares closing price to price range over time' },
  { id: 13, name: 'ATR Breakout',           description: 'Uses Average True Range to identify volatility breakouts' },
  { id: 14, name: 'Inside Bar Pattern',     description: 'Consolidation pattern before a major price move' },
  { id: 15, name: 'VWAP Strategy',          description: 'Trade relative to Volume Weighted Average Price' },
  { id: 16, name: 'Death Cross Reversal',   description: 'SMA 50 crosses below SMA 200 — bearish signal to short' },
  { id: 17, name: 'RSI Divergence',         description: 'Price and RSI move in opposite directions — reversal signal' },
  { id: 18, name: 'Gap Fill Strategy',      description: 'Stocks tend to fill price gaps — fade the gap open' },
  { id: 19, name: 'Swing High/Low',         description: 'Trade between swing highs and lows in a range' },
  { id: 20, name: 'Fibonacci Retracement',  description: 'Buy at key Fibonacci levels during a pullback' },
];

function getLevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr = [];
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = i === 0 ? j : Math.min(
        arr[i - 1][j] + 1,
        arr[i][j - 1] + 1,
        arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
      );
    }
  }
  return arr[t.length][s.length];
}

// Mini Component to fetch and display Live Market Indices
const MarketIndexCard = ({ title, symbol, currency }: { title: string, symbol: string, currency: string }) => {
  const { data } = useSWR(`/api/v1/quote/${symbol}`, fetcher, { refreshInterval: 60000 });
  return (
    <div className="bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center shadow-lg transition-transform hover:scale-105">
      <span className="text-gray-500 font-mono text-xs uppercase tracking-widest mb-2">{title}</span>
      {data && data.price ? (
        <>
          <span className="text-2xl font-bold text-white tracking-tighter">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-xs font-mono mt-1 px-2 py-0.5 rounded ${data.change_percent > 0 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {data.change_percent > 0 ? '▲' : '▼'} {Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </>
      ) : (
        <div className="h-10 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default function Home() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedStrategyId, setExpandedStrategyId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<'INDIA' | 'US' | 'CRYPTO' | null>(null);
  
  const chartRef = useRef<HTMLDivElement>(null);

  // Only fetch analysis and chart if a ticker is selected
  const { data: quote } = useSWR(ticker ? `/api/v1/quote/${ticker}` : null, fetcher, { refreshInterval: 30000 });
  const { data: chartData } = useSWR(ticker ? `/api/v1/chart/${ticker}` : null, fetcher);
  const { data: analysis } = useSWR(ticker ? `/api/v1/analyze/${ticker}` : null, fetcher);

  useEffect(() => {
    if (input.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = input.trim().toLowerCase();
    
    const mapped = STOCKS.map(s => {
      const nameDist = getLevenshteinDistance(q, s.name.toLowerCase());
      const symDist = getLevenshteinDistance(q, s.symbol.toLowerCase());
      const exactMatch = s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q) ? 0 : 100;
      const bestScore = Math.min(nameDist, symDist, exactMatch);
      return { ...s, score: bestScore };
    });
    
    const filtered = mapped.filter(s => s.score < 5).sort((a, b) => a.score - b.score).slice(0, 8);
    setSuggestions(filtered);
    setShowSuggestions(true);
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (suggestions.length > 0) {
        selectStock(suggestions[0]);
      }
    }
  };

  useEffect(() => {
    if (!ticker || !chartData || !chartRef.current || !Array.isArray(chartData) || chartData.length === 0) return;
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
  }, [chartData, ticker]);

  const selectStock = (stock: typeof STOCKS[0]) => {
    setTicker(stock.ticker);
    setCurrency(stock.currency);
    setInput('');
    setShowSuggestions(false);
    setExpandedStrategyId(null);
  };

  const getCategoryStocks = () => {
    if (activeCategory === 'INDIA') return STOCKS.filter(s => s.exchange === 'NSE' || s.exchange === 'BSE').slice(0, 15);
    if (activeCategory === 'US') return STOCKS.filter(s => s.exchange === 'NASDAQ' || s.exchange === 'NYSE').slice(0, 15);
    if (activeCategory === 'CRYPTO') return STOCKS.filter(s => s.exchange === 'CRYPTO').slice(0, 15);
    return [];
  };

  const verdictColor = analysis?.verdict?.includes('Buy') ? 'text-cyan-400 shadow-cyan-400/50' :
    analysis?.verdict === 'Hold' ? 'text-amber-400 shadow-amber-400/50' : 'text-rose-400 shadow-rose-400/50';

  const verdictBg = analysis?.verdict?.includes('Buy') ? 'border-cyan-500/40 bg-cyan-950/20' :
    analysis?.verdict === 'Hold' ? 'border-amber-500/40 bg-amber-950/20' : 'border-rose-500/40 bg-rose-950/20';

  const sentimentScore = analysis?.sentiment?.score || 0;
  const pointerPosition = Math.max(5, Math.min(95, ((sentimentScore + 1) / 2) * 100));

  return (
    <div className="min-h-screen bg-[#030305] text-gray-200 selection:bg-cyan-500/30" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
      
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:2rem_2rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
      </div>

      <div className="relative z-10 p-4 sm:p-6 md:p-12 max-w-7xl mx-auto">
        
        {/* --- HEADER --- */}
        <div className="pt-8 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-md mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-[10px] md:text-xs font-mono text-cyan-300 tracking-[0.2em] uppercase">System Online // v2.0</span>
          </div>
          <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black mb-4 tracking-tighter bg-gradient-to-br from-white via-cyan-100 to-cyan-800 bg-clip-text text-transparent filter drop-shadow-[0_0_15px_rgba(34,211,238,0.2)] break-words leading-tight px-2 w-full cursor-pointer" onClick={() => setTicker(null)}>
            SignalX
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm md:text-base font-mono tracking-[0.1em] uppercase max-w-2xl px-4 mb-12">
            Wall Street Has Competition
          </p>
        </div>

        {/* --- GLOBAL SEARCH BAR --- */}
        <div className="relative w-full max-w-3xl mx-auto mb-16 px-4 sm:px-0">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full blur opacity-20"></div>
          <div className="relative">
             <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 px-6 sm:px-8 py-4 sm:py-5 rounded-full text-lg sm:text-xl text-white outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder-gray-600 font-mono text-center sm:text-left"
              placeholder="e.g. Apple, TCS, Bitcoin"
            />
          </div>
          
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-[calc(100%-2rem)] sm:w-full mx-4 sm:mx-0 bg-[#0a0a0c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl mt-4 shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden">
              {suggestions.map((stock, i) => (
                <div key={i} onMouseDown={() => selectStock(stock)}
                  className="flex justify-between items-center px-6 py-4 hover:bg-cyan-500/10 hover:pl-8 cursor-pointer border-b border-white/5 last:border-0 transition-all duration-200">
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-gray-100">{stock.name}</span>
                    <span className="text-cyan-500/70 text-xs font-mono">{stock.symbol}</span>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-mono backdrop-blur-sm ${
                    stock.exchange === 'CRYPTO' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 
                    'bg-white/5 border border-white/10 text-gray-300'
                  }`}>
                    {stock.exchange}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ========================================= */}
        {/* VIEW 1: HOME MARKET OVERVIEW (When No Ticker Selected) */}
        {/* ========================================= */}
        {!ticker && (
          <div className="animate-in fade-in duration-500">
            {/* Live Indices */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-16">
               <MarketIndexCard title="NIFTY 50" symbol="^NSEI" currency="" />
               <MarketIndexCard title="SENSEX" symbol="^BSESN" currency="" />
               <MarketIndexCard title="NASDAQ" symbol="^IXIC" currency="" />
            </div>

            {/* Category Selector */}
            <h2 className="text-center text-xl font-bold mb-6 tracking-tight text-white">Explore Markets</h2>
            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10 max-w-3xl mx-auto px-4">
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'INDIA' ? null : 'INDIA')}
                  className={`flex-1 py-4 px-6 rounded-2xl font-mono font-bold tracking-widest text-sm transition-all border ${
                    activeCategory === 'INDIA' ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}>
                 Indian Stocks
               </button>
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'US' ? null : 'US')}
                  className={`flex-1 py-4 px-6 rounded-2xl font-mono font-bold tracking-widest text-sm transition-all border ${
                    activeCategory === 'US' ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}>
                 US Stocks
               </button>
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'CRYPTO' ? null : 'CRYPTO')}
                  className={`flex-1 py-4 px-6 rounded-2xl font-mono font-bold tracking-widest text-sm transition-all border ${
                    activeCategory === 'CRYPTO' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.3)]' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}>
                 Cryptocurrency
               </button>
            </div>

            {/* Expanded Category Grid */}
            {activeCategory && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto animate-in slide-in-from-top-4 fade-in duration-300">
                {getCategoryStocks().map((stock, i) => (
                  <button 
                    key={i} 
                    onClick={() => selectStock(stock)}
                    className="bg-black/40 border border-white/10 rounded-2xl p-4 text-left hover:bg-white/10 hover:border-cyan-500/50 hover:-translate-y-1 transition-all group"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-mono text-gray-500 group-hover:text-cyan-400 transition-colors">{stock.symbol}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/50"></span>
                    </div>
                    <span className="font-bold text-sm text-gray-200 line-clamp-1">{stock.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================= */}
        {/* VIEW 2: DASHBOARD (When Ticker Selected) */}
        {/* ========================================= */}
        {ticker && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            {/* Back Button */}
            <div className="mb-6">
              <button 
                onClick={() => setTicker(null)}
                className="text-gray-500 font-mono text-sm hover:text-cyan-400 transition-colors flex items-center gap-2"
              >
                ← Back to Market Overview
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
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
                    FETCHING ALGORITHMIC DATA...
                  </div>
                ) : (
                  <div ref={chartRef} className="w-full h-[300px] sm:h-[450px]" />
                )}
              </div>

              <div className="lg:col-span-4 flex flex-col gap-8">
                <div className="border border-white/10 bg-white/[0.01] backdrop-blur-2xl rounded-[2rem] p-6 sm:p-8 relative overflow-hidden flex-1 shadow-2xl">
                  <div className="absolute top-0 left-0 w-64 h-64 bg-purple-500/10 blur-[100px] pointer-events-none"></div>
                  <h3 className="text-sm font-mono text-purple-400 tracking-widest uppercase mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span>
                    Global News NLP
                  </h3>
                  
                  <div className="mb-8 mt-12">
                    <div className="relative w-full h-3 rounded-full border border-white/10 bg-black/50">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-500 via-gray-500 to-cyan-500 opacity-80" />
                      <div 
                        className="absolute top-[-36px] -translate-x-1/2 flex flex-col items-center transition-all duration-1000 ease-out"
                        style={{ left: `${pointerPosition}%` }}
                      >
                        <div className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider mb-1 uppercase whitespace-nowrap ${
                          analysis?.sentiment?.label === 'Bullish' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.3)]' :
                          analysis?.sentiment?.label === 'Bearish' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                        }`}>
                          {analysis?.sentiment?.label || 'ANALYZING...'}
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 21L1 3H23L12 21Z" fill="currentColor"/>
                        </svg>
                      </div>
                    </div>
                    
                    <div className="flex justify-between text-[10px] font-mono text-gray-500 mt-2 px-1 tracking-widest uppercase">
                      <span>Bearish</span><span>Neutral</span><span>Bullish</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <span className="text-xs text-gray-600 font-mono uppercase tracking-widest block border-b border-white/5 pb-2">Latest Verified Scans</span>
                    {analysis?.sentiment?.headlines && analysis.sentiment.headlines.length > 0 ? (
                      <ul className="space-y-3">
                        {analysis.sentiment.headlines.map((headline: string, idx: number) => (
                          <li key={idx} className="text-xs sm:text-sm text-gray-300 font-sans leading-relaxed border-l-[3px] border-purple-500/50 pl-4 py-2 bg-white/[0.03] rounded-r-lg">
                            {headline || "Unknown Headline"}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs sm:text-sm text-gray-500 font-sans italic p-4 bg-white/5 rounded-xl border border-white/10">
                        No verified news data available for this asset.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {analysis && !analysis.error && (
              <div className={`border backdrop-blur-2xl rounded-[2rem] p-6 sm:p-10 mb-12 relative overflow-hidden shadow-2xl ${verdictBg}`}>
                 <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-[100px] pointer-events-none"></div>
                 
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b border-white/10 pb-8">
                    <div>
                      <h3 className="text-sm font-mono text-gray-400 tracking-widest uppercase mb-1">Algorithm Verdict & Forecast</h3>
                      <div className={`text-5xl sm:text-7xl font-black tracking-tight ${verdictColor}`}>{analysis.verdict}</div>
                    </div>
                    
                    <div className="mt-6 md:mt-0 text-left md:text-right">
                       <span className="text-xs font-mono text-gray-500 tracking-widest uppercase block mb-2">AI Confidence Level</span>
                       <div className="flex items-center gap-4">
                         <div className="text-4xl font-mono text-white">{analysis.confidence}%</div>
                         <div className="flex gap-1.5">
                            {[1,2,3,4,5].map(i => (
                              <div key={i} className={`w-8 h-2 rounded-full ${i <= Math.ceil(analysis.confidence / 20) ? 'bg-cyan-400' : 'bg-white/10'}`} />
                            ))}
                         </div>
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                    <div className="bg-black/30 rounded-2xl p-5 border border-white/5">
                      <span className="text-gray-500 text-xs font-mono uppercase tracking-wider block mb-1">Entry Vector</span>
                      <p className="text-3xl font-mono text-white">{currency}{analysis.entry}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                        <span className="text-[10px] font-mono text-gray-500 uppercase">Profile</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          analysis.risk_level === 'High Risk' ? 'bg-rose-500/20 text-rose-400' :
                          analysis.risk_level === 'Medium Risk' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'
                        }`}>{analysis.risk_level}</span>
                      </div>
                    </div>

                    <div className="bg-black/30 rounded-2xl p-5 border border-white/5 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <span className="text-gray-500 text-xs font-mono uppercase tracking-wider block mb-1">Target Price</span>
                      <p className="text-4xl font-mono text-cyan-400">{currency}{analysis.target}</p>
                      <p className="text-cyan-500/50 text-[10px] font-mono uppercase tracking-wider mt-1">Take Profit Zone</p>
                    </div>

                    <div className="bg-black/30 rounded-2xl p-5 border border-white/5">
                      <span className="text-gray-500 text-xs font-mono uppercase tracking-wider block mb-1">Hard Stop-Loss</span>
                      <p className="text-4xl font-mono text-rose-400">{currency}{analysis.stop_loss}</p>
                      <p className="text-rose-500/50 text-[10px] font-mono uppercase tracking-wider mt-1">Max Risk Tolerance</p>
                    </div>

                    <div className="bg-cyan-500/10 rounded-2xl p-5 border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
                      <span className="text-cyan-400 text-xs font-mono uppercase tracking-wider block mb-1">Expected Timeframe</span>
                      <p className="text-3xl font-mono text-white">{analysis.estimated_days} Days</p>
                      <p className="text-cyan-300 text-sm font-mono mt-1 border-t border-cyan-500/20 pt-2">By {analysis.target_date}</p>
                    </div>
                 </div>
                 
                 <div className="bg-black/30 rounded-2xl p-6 md:p-8 border border-white/5">
                    <div className="flex justify-between items-end mb-4">
                       <div className="flex items-center gap-2">
                         <span className="text-sm font-mono text-gray-400 uppercase tracking-widest">FISO Score</span>
                         <div className="group relative">
                            <span className="cursor-help w-4 h-4 rounded-full border border-gray-600 text-gray-400 flex items-center justify-center text-[10px] hover:bg-white/10 hover:text-white transition-colors">?</span>
                            <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-black/90 border border-white/10 rounded-xl text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                              <strong>Fundamental Indicator Strength Oscillator</strong><br/><br/>Synthesizes Trend (SMA), Momentum (RSI), Volume (MACD), and Live News into a single 0-100 mathematical score.
                            </div>
                         </div>
                       </div>
                       <span className="text-3xl font-mono text-white">{analysis.fiso_score}<span className="text-lg text-gray-600">/100</span></span>
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-2 mb-6 overflow-hidden border border-white/5">
                      <div className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-cyan-500 transition-all duration-1000" style={{ width: `${analysis.fiso_score}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                       <div className="bg-white/5 p-3 rounded-xl text-center border border-white/5">
                         <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-1">Trend Base</div>
                         <div className="text-base font-mono text-cyan-300">{analysis.components.trend}/35</div>
                       </div>
                       <div className="bg-white/5 p-3 rounded-xl text-center border border-white/5">
                         <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-1">Momentum</div>
                         <div className="text-base font-mono text-amber-300">{analysis.components.momentum}/35</div>
                       </div>
                       <div className="bg-white/5 p-3 rounded-xl text-center border border-white/5">
                         <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-1">Signal Hash</div>
                         <div className="text-base font-mono text-purple-300">{analysis.components.signal}/30</div>
                       </div>
                    </div>
                 </div>
              </div>
            )}

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
                        <div className="flex justify-between items-start mb-3">
                          <span className={`font-mono text-[10px] tracking-widest uppercase block ${
                            isBest ? 'text-cyan-400 font-bold' : 'text-gray-500'
                          }`}>MODEL {String(strategy.id).padStart(2, '0')}</span>
                          
                          {isExpanded && (
                            <button className="sm:hidden text-gray-400 hover:text-white">✕</button>
                          )}
                        </div>

                        <span className="font-bold text-sm leading-tight block text-white mb-3">{strategy.name}</span>
                        
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
        )}
      </div>
    </div>
  );
}