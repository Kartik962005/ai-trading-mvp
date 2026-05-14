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

// Compact Market Index Card
const MarketIndexCard = ({ title, symbol, currency }: { title: string, symbol: string, currency: string }) => {
  const { data } = useSWR(`/api/v1/quote/${symbol}`, fetcher, { refreshInterval: 60000 });
  return (
    <div className="bg-black/60 backdrop-blur-xl border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center shadow-lg transition-transform hover:scale-105 hover:bg-white/[0.02]">
      <span className="text-gray-400 font-medium text-[10px] uppercase tracking-[0.2em] mb-1">{title}</span>
      {data && data.price ? (
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-white tracking-tight">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${data.change_percent > 0 ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}`}>
            {data.change_percent > 0 ? '▲' : '▼'} {Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </div>
      ) : (
        <div className="h-7 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></div>
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
        height: 400,
        layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.02)' }, horzLines: { color: 'rgba(255,255,255,0.02)' } },
        crosshair: { mode: 1 },
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#a78bfa', downColor: '#fb7185', // Pastel Purple & Pastel Rose
        borderVisible: false, wickUpColor: '#a78bfa', wickDownColor: '#fb7185'
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

  // Pastel AMOLED Palette Mapping
  const verdictColor = analysis?.verdict?.includes('Buy') ? 'text-emerald-300 drop-shadow-[0_0_15px_rgba(110,231,183,0.3)]' :
    analysis?.verdict === 'Hold' ? 'text-amber-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.3)]' : 'text-rose-400 drop-shadow-[0_0_15px_rgba(251,113,133,0.3)]';

  const verdictBg = analysis?.verdict?.includes('Buy') ? 'border-emerald-500/20 bg-emerald-950/10' :
    analysis?.verdict === 'Hold' ? 'border-amber-500/20 bg-amber-950/10' : 'border-rose-500/20 bg-rose-950/10';

  const sentimentScore = analysis?.sentiment?.score || 0;
  const pointerPosition = Math.max(5, Math.min(95, ((sentimentScore + 1) / 2) * 100));

  return (
    <div className="min-h-screen bg-black text-gray-200 selection:bg-indigo-500/30 font-sans" style={{ fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" }}>
      
      {/* AMOLED Pastel Orbs Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-emerald-600/5 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 p-4 sm:p-6 max-w-6xl mx-auto flex flex-col justify-center min-h-screen">
        
        {/* --- HEADER --- */}
        <div className="text-center flex flex-col items-center mb-6">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black mb-2 tracking-tighter cursor-pointer" onClick={() => setTicker(null)}>
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-pink-300 via-purple-300 to-indigo-400 drop-shadow-[0_0_25px_rgba(216,180,254,0.4)]">Signal</span>
            <span className="text-white">X</span>
          </h1>
          <p className="text-purple-200/70 text-[10px] sm:text-xs font-medium tracking-[0.2em] uppercase">
            Because “Trust Me Bro” Isn’t a Strategy.
          </p>
        </div>

        {/* --- GLOBAL SEARCH BAR --- */}
        <div className="relative w-full max-w-2xl mx-auto mb-6 px-2 sm:px-0">
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-indigo-500/20 rounded-2xl blur-lg opacity-50"></div>
          <div className="relative">
             <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#09090b]/90 backdrop-blur-xl border border-white/10 px-6 py-4 rounded-2xl text-lg text-white outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder-gray-600 font-mono text-center sm:text-left shadow-2xl"
              placeholder="> INITIATE TERMINAL [ASSET/TICKER]"
            />
          </div>
          
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full bg-[#09090b]/95 backdrop-blur-2xl border border-white/10 rounded-2xl mt-3 shadow-2xl overflow-hidden">
              {suggestions.map((stock, i) => (
                <div key={i} onMouseDown={() => selectStock(stock)}
                  className="flex justify-between items-center px-6 py-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition-colors">
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-gray-100">{stock.name}</span>
                    <span className="text-purple-400/70 text-[10px] font-mono tracking-wider">{stock.symbol}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-md font-mono tracking-wider font-bold ${
                    stock.exchange === 'CRYPTO' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 
                    'bg-white/5 border border-white/10 text-gray-400'
                  }`}>
                    {stock.exchange}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ========================================= */}
        {/* VIEW 1: HOME MARKET OVERVIEW */}
        {/* ========================================= */}
        {!ticker && (
          <div className="animate-in fade-in duration-700 flex-1 flex flex-col justify-start">
            {/* 4-Column Compact Indices */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto w-full mb-8 px-2 sm:px-0">
               <MarketIndexCard title="NIFTY 50" symbol="^NSEI" currency="" />
               <MarketIndexCard title="SENSEX" symbol="^BSESN" currency="" />
               <MarketIndexCard title="NASDAQ" symbol="^IXIC" currency="" />
               <MarketIndexCard title="BITCOIN" symbol="BTC-USD" currency="$" />
            </div>

            {/* Category Selector */}
            <div className="flex justify-center gap-3 max-w-2xl mx-auto w-full px-2 sm:px-0 mb-6">
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'INDIA' ? null : 'INDIA')}
                  className={`flex-1 py-3 rounded-xl font-semibold tracking-wide text-xs sm:text-sm transition-all border ${
                    activeCategory === 'INDIA' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                  }`}>
                 India
               </button>
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'US' ? null : 'US')}
                  className={`flex-1 py-3 rounded-xl font-semibold tracking-wide text-xs sm:text-sm transition-all border ${
                    activeCategory === 'US' ? 'bg-pink-500/20 border-pink-500/50 text-pink-300 shadow-[0_0_20px_rgba(236,72,153,0.2)]' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                  }`}>
                 Global
               </button>
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'CRYPTO' ? null : 'CRYPTO')}
                  className={`flex-1 py-3 rounded-xl font-semibold tracking-wide text-xs sm:text-sm transition-all border ${
                    activeCategory === 'CRYPTO' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                  }`}>
                 Crypto
               </button>
            </div>

            {/* Expanded Category Grid */}
            {activeCategory && (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 max-w-4xl mx-auto w-full px-2 sm:px-0 animate-in fade-in duration-300">
                {getCategoryStocks().map((stock, i) => (
                  <button 
                    key={i} 
                    onClick={() => selectStock(stock)}
                    className="bg-[#09090b]/80 border border-white/5 rounded-xl p-3 text-left hover:bg-white/5 hover:border-purple-500/30 transition-all group"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-mono text-gray-500 group-hover:text-purple-300 transition-colors">{stock.symbol}</span>
                    </div>
                    <span className="font-bold text-xs text-gray-200 line-clamp-1">{stock.name}</span>
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
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mb-4">
              <button onClick={() => setTicker(null)} className="text-gray-500 font-medium text-xs hover:text-purple-300 transition-colors flex items-center gap-2">
                ← Return to Hub
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
              {/* Chart Terminal */}
              <div className="lg:col-span-8 border border-white/5 bg-[#09090b]/60 backdrop-blur-2xl rounded-3xl p-5 shadow-2xl relative overflow-hidden group">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 border-b border-white/5 pb-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{ticker}</h2>
                  </div>
                  {quote && quote.price && (
                    <div className="text-left sm:text-right mt-2 sm:mt-0">
                      <span className="text-3xl font-bold tracking-tighter text-white">{currency}{quote.price}</span>
                      <div className={`text-sm font-semibold flex items-center justify-start sm:justify-end gap-1 ${quote.change_percent > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>

                {!chartData ? (
                  <div className="h-[400px] flex flex-col items-center justify-center text-purple-400/50 gap-4">
                    <div className="w-8 h-8 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    <span className="text-xs font-mono tracking-widest">FETCHING DATA...</span>
                  </div>
                ) : (
                  <div ref={chartRef} className="w-full h-[300px] sm:h-[400px]" />
                )}
              </div>

              {/* Global News NLP */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                <div className="border border-white/5 bg-[#09090b]/60 backdrop-blur-2xl rounded-3xl p-6 relative overflow-hidden flex-1 shadow-2xl">
                  <h3 className="text-xs font-bold text-indigo-300 tracking-widest uppercase mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></span>
                    Live NLP Sentinel
                  </h3>
                  
                  <div className="mb-6 mt-10">
                    <div className="relative w-full h-2 rounded-full bg-white/5">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-400 via-gray-500 to-emerald-400 opacity-60" />
                      <div className="absolute top-[-30px] -translate-x-1/2 flex flex-col items-center transition-all duration-1000 ease-out" style={{ left: `${pointerPosition}%` }}>
                        <div className={`px-2 py-1 rounded text-[9px] font-black tracking-widest uppercase shadow-xl ${
                          analysis?.sentiment?.label === 'Bullish' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
                          analysis?.sentiment?.label === 'Bearish' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : 'bg-white/5 text-gray-300 border border-white/10'
                        }`}>
                          {analysis?.sentiment?.label || 'ANALYZING...'}
                        </div>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white" className="mt-0.5"><path d="M12 21L1 3H23L12 21Z" fill="currentColor"/></svg>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {analysis?.sentiment?.headlines && analysis.sentiment.headlines.length > 0 ? (
                      <ul className="space-y-2">
                        {analysis.sentiment.headlines.map((headline: string, idx: number) => (
                          <li key={idx} className="text-xs text-gray-400 leading-snug border-l-2 border-indigo-500/30 pl-3 py-1">
                            {headline}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500 italic p-3 bg-white/5 rounded-xl text-center">No verified news detected.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* UNIFIED DASHBOARD: ALGORITHM VERDICT & FORECAST */}
            {analysis && !analysis.error && (
              <div className={`border backdrop-blur-2xl rounded-3xl p-6 sm:p-8 mb-8 shadow-2xl ${verdictBg}`}>
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-white/5 pb-6">
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-1">Algorithm Verdict</h3>
                      <div className={`text-4xl sm:text-6xl font-black tracking-tight ${verdictColor}`}>{analysis.verdict}</div>
                    </div>
                    
                    <div className="mt-4 md:mt-0 text-left md:text-right">
                       <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase block mb-2">AI Confidence</span>
                       <div className="flex items-center gap-3">
                         <div className="text-3xl font-bold text-white tracking-tight">{analysis.confidence}%</div>
                         <div className="flex gap-1">
                            {[1,2,3,4,5].map(i => (
                              <div key={i} className={`w-6 h-1.5 rounded-full ${i <= Math.ceil(analysis.confidence / 20) ? 'bg-indigo-400' : 'bg-white/10'}`} />
                            ))}
                         </div>
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    <div className="bg-[#000000]/40 rounded-2xl p-4 border border-white/5">
                      <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest block mb-1">Entry Vector</span>
                      <p className="text-2xl font-bold text-white tracking-tight">{currency}{analysis.entry}</p>
                    </div>

                    <div className="bg-[#000000]/40 rounded-2xl p-4 border border-emerald-500/10">
                      <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest block mb-1">Take Profit Target</span>
                      <p className="text-3xl font-bold text-emerald-300 tracking-tight">{currency}{analysis.target}</p>
                    </div>

                    <div className="bg-[#000000]/40 rounded-2xl p-4 border border-rose-500/10">
                      <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest block mb-1">Hard Stop-Loss</span>
                      <p className="text-3xl font-bold text-rose-300 tracking-tight">{currency}{analysis.stop_loss}</p>
                    </div>

                    <div className="bg-indigo-500/10 rounded-2xl p-4 border border-indigo-500/20">
                      <span className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest block mb-1">Est. Timeframe</span>
                      <p className="text-2xl font-bold text-white tracking-tight">{analysis.estimated_days} Days</p>
                      <p className="text-indigo-300/70 text-[10px] font-mono mt-1">By {analysis.target_date}</p>
                    </div>
                 </div>
                 
                 <div className="bg-[#000000]/30 rounded-2xl p-5 border border-white/5">
                    <div className="flex justify-between items-end mb-3">
                       <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">FISO Score Synthesis</span>
                       <span className="text-2xl font-bold text-white">{analysis.fiso_score}<span className="text-sm text-gray-500">/100</span></span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5 mb-4 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-400" style={{ width: `${analysis.fiso_score}%` }} />
                    </div>
                 </div>
              </div>
            )}

            {/* TACTICAL STRATEGY MATRIX */}
            {analysis && !analysis.error && (
              <div className="border border-white/5 bg-[#09090b]/60 backdrop-blur-2xl rounded-3xl p-6 sm:p-10 mb-8">
                <div className="mb-8">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-1">Tactical Strategy Matrix</h2>
                  <p className="text-gray-500 text-[10px] sm:text-xs uppercase tracking-widest">Hover or tap to expand 20 validated models</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
                        className={`relative p-4 rounded-2xl border transition-all duration-300 cursor-pointer ${
                          isBest ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'border-white/5 hover:border-white/20'
                        } ${isExpanded ? 'bg-black/80 z-20 scale-105' : 'bg-black/40'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[9px] tracking-widest uppercase block ${isBest ? 'text-purple-400 font-bold' : 'text-gray-600'}`}>
                            MODEL {String(strategy.id).padStart(2, '0')}
                          </span>
                        </div>

                        <span className="font-bold text-sm text-gray-200 mb-2 block">{strategy.name}</span>
                        
                        {evalData && (
                          <div className="flex items-center gap-1">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                               evalData.score > 75 ? 'bg-emerald-500/10 text-emerald-400' : 
                               evalData.score > 40 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              SCORE: {evalData.score}
                            </span>
                            {isBest && <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-bold uppercase">Best Fit</span>}
                          </div>
                        )}

                        <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-64 opacity-100 mt-3 border-t border-white/10 pt-3' : 'max-h-0 opacity-0'}`}>
                          <p className="text-[10px] text-gray-500 mb-2">{strategy.description}</p>
                          <p className="text-xs text-gray-300 leading-snug border-l-2 border-purple-500/50 pl-2">
                            {evalData?.desc || "Awaiting calculation..."}
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