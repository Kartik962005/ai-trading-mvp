'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`https://ai-trading-backend-jhcl.onrender.com${url}`).then(res => res.json());

// --- EXPANDED DATA ARRAYS (~15-20 per category for a rich grid) ---
const STOCKS = [
  // NSE (No Tata Motors)
  { name: 'Reliance Ind.', symbol: 'RELIANCE', exchange: 'NSE', ticker: 'RELIANCE.NS', currency: '₹' },
  { name: 'TCS', symbol: 'TCS', exchange: 'NSE', ticker: 'TCS.NS', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'NSE', ticker: 'HDFCBANK.NS', currency: '₹' },
  { name: 'ICICI Bank', symbol: 'ICICIBANK', exchange: 'NSE', ticker: 'ICICIBANK.NS', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'NSE', ticker: 'INFY.NS', currency: '₹' },
  { name: 'State Bank', symbol: 'SBIN', exchange: 'NSE', ticker: 'SBIN.NS', currency: '₹' },
  { name: 'Bharti Airtel', symbol: 'BHARTIARTL', exchange: 'NSE', ticker: 'BHARTIARTL.NS', currency: '₹' },
  { name: 'ITC Ltd', symbol: 'ITC', exchange: 'NSE', ticker: 'ITC.NS', currency: '₹' },
  { name: 'Larsen & Toubro', symbol: 'LT', exchange: 'NSE', ticker: 'LT.NS', currency: '₹' },
  { name: 'Bajaj Finance', symbol: 'BAJFINANCE', exchange: 'NSE', ticker: 'BAJFINANCE.NS', currency: '₹' },
  { name: 'Adani Ent.', symbol: 'ADANIENT', exchange: 'NSE', ticker: 'ADANIENT.NS', currency: '₹' },
  { name: 'Asian Paints', symbol: 'ASIANPAINT', exchange: 'NSE', ticker: 'ASIANPAINT.NS', currency: '₹' },
  { name: 'HCL Tech', symbol: 'HCLTECH', exchange: 'NSE', ticker: 'HCLTECH.NS', currency: '₹' },
  { name: 'Axis Bank', symbol: 'AXISBANK', exchange: 'NSE', ticker: 'AXISBANK.NS', currency: '₹' },
  { name: 'Maruti Suzuki', symbol: 'MARUTI', exchange: 'NSE', ticker: 'MARUTI.NS', currency: '₹' },
  { name: 'Sun Pharma', symbol: 'SUNPHARMA', exchange: 'NSE', ticker: 'SUNPHARMA.NS', currency: '₹' },
  
  // US
  { name: 'Apple', symbol: 'AAPL', exchange: 'NASDAQ', ticker: 'AAPL', currency: '$' },
  { name: 'Microsoft', symbol: 'MSFT', exchange: 'NASDAQ', ticker: 'MSFT', currency: '$' },
  { name: 'Nvidia', symbol: 'NVDA', exchange: 'NASDAQ', ticker: 'NVDA', currency: '$' },
  { name: 'Tesla', symbol: 'TSLA', exchange: 'NASDAQ', ticker: 'TSLA', currency: '$' },
  { name: 'Google', symbol: 'GOOGL', exchange: 'NASDAQ', ticker: 'GOOGL', currency: '$' },
  { name: 'Amazon', symbol: 'AMZN', exchange: 'NASDAQ', ticker: 'AMZN', currency: '$' },
  { name: 'Meta', symbol: 'META', exchange: 'NASDAQ', ticker: 'META', currency: '$' },
  { name: 'Netflix', symbol: 'NFLX', exchange: 'NASDAQ', ticker: 'NFLX', currency: '$' },
  { name: 'AMD', symbol: 'AMD', exchange: 'NASDAQ', ticker: 'AMD', currency: '$' },
  { name: 'Intel', symbol: 'INTC', exchange: 'NASDAQ', ticker: 'INTC', currency: '$' },
  { name: 'JPMorgan', symbol: 'JPM', exchange: 'NYSE', ticker: 'JPM', currency: '$' },
  { name: 'Visa', symbol: 'V', exchange: 'NYSE', ticker: 'V', currency: '$' },
  { name: 'Walmart', symbol: 'WMT', exchange: 'NYSE', ticker: 'WMT', currency: '$' },
  { name: 'Johnson & Johnson', symbol: 'JNJ', exchange: 'NYSE', ticker: 'JNJ', currency: '$' },
  
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
  { name: 'Avalanche', symbol: 'AVAX', exchange: 'CRYPTO', ticker: 'AVAX-USD', currency: '$' },
  { name: 'Shiba Inu', symbol: 'SHIB', exchange: 'CRYPTO', ticker: 'SHIB-USD', currency: '$' },
];

const STRATEGIES = [
  { id: 1,  name: 'Golden Cross', desc: 'SMA 50 crosses above SMA 200' },
  { id: 2,  name: 'RSI Oversold', desc: 'RSI below 30 signals oversold' },
  { id: 3,  name: 'MACD Crossover', desc: 'MACD line crosses signal line' },
  { id: 4,  name: 'Bollinger Breakout', desc: 'Price breaks above upper band' },
  { id: 5,  name: 'Volume Anomaly', desc: 'Spike in institutional buying' },
  { id: 6,  name: 'Mean Reversion', desc: 'Price extended from moving average' },
];

function getLevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr = [];
  for (let i = 0; i <= t.length; i++) { arr[i] = [i]; for (let j = 1; j <= s.length; j++) { arr[i][j] = i === 0 ? j : Math.min(arr[i - 1][j] + 1, arr[i][j - 1] + 1, arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)); } }
  return arr[t.length][s.length];
}

const TickerItem = ({ title, symbol, currency }: { title: string, symbol: string, currency: string }) => {
  const { data } = useSWR(`/api/v1/quote/${symbol}`, fetcher, { refreshInterval: 60000 });
  return (
    <div className="flex items-center gap-4 shrink-0 px-8 border-r border-white/10">
      <span className="font-bold text-xs tracking-widest text-zinc-400 uppercase font-['Space_Grotesk']">{title}</span>
      {data && data.price ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-['JetBrains_Mono'] text-white">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.change_percent > 0 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-fuchsia-500/20 text-fuchsia-400'}`}>
            {data.change_percent > 0 ? '▲' : '▼'}{Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </div>
      ) : (
        <span className="text-xs text-zinc-600 font-['JetBrains_Mono'] tracking-widest">SYNCING...</span>
      )}
    </div>
  );
};

// --- Custom Expandable Asset Card ---
const MarketAssetCard = ({ stock, onSelect }: { stock: typeof STOCKS[0], onSelect: (s: typeof STOCKS[0]) => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  // Fetch analysis only when hovered to save API calls
  const { data: analysis } = useSWR(isHovered ? `/api/v1/analyze/${stock.ticker}` : null, fetcher);

  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const verdictColor = isBull ? 'text-cyan-400' : isHold ? 'text-zinc-300' : 'text-fuchsia-400';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(stock)}
      className="relative p-4 border border-white/10 bg-black/40 backdrop-blur-md rounded-2xl hover:border-cyan-500/50 hover:bg-cyan-900/20 transition-all duration-300 cursor-pointer group flex flex-col justify-start overflow-hidden"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] font-bold text-zinc-500 group-hover:text-cyan-400 font-['JetBrains_Mono'] transition-colors">{stock.symbol}</span>
        <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-zinc-400 font-['JetBrains_Mono']">{stock.exchange}</span>
      </div>
      <div className="font-bold text-sm text-zinc-200 group-hover:text-white font-['Space_Grotesk'] truncate">{stock.name}</div>

      {/* Expanded State Dropdown */}
      <div className={`transition-all duration-300 ease-in-out ${isHovered ? 'max-h-40 opacity-100 mt-4 border-t border-white/10 pt-4' : 'max-h-0 opacity-0'}`}>
        {analysis && !analysis.error ? (
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Verdict</span>
              <span className={`text-sm font-black uppercase tracking-widest ${verdictColor}`}>{analysis.verdict}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">FISO Score</span>
              <span className="text-sm font-['JetBrains_Mono'] text-white font-bold">{analysis.fiso_score}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Confidence</span>
              <span className="text-sm font-['JetBrains_Mono'] text-white font-bold">{analysis.confidence}%</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
             <span className="text-[10px] text-cyan-500/70 animate-pulse font-['JetBrains_Mono'] tracking-widest">INITIALIZING ALGORITHM...</span>
          </div>
        )}
      </div>
    </div>
  );
};


export default function Home() {
  const [ticker, setTicker] = useState<string | null>(null);
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeMarket, setActiveMarket] = useState<'INDIA' | 'US' | 'CRYPTO' | null>('INDIA');
  
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
      return { ...s, score: Math.min(nameDist, symDist, exactMatch) };
    });
    setSuggestions(mapped.filter(s => s.score < 5).sort((a, b) => a.score - b.score).slice(0, 6));
    setShowSuggestions(true);
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      selectStock(suggestions[0]);
    }
  };

  useEffect(() => {
    if (!ticker || !chartData || !chartRef.current || !Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth || 800,
        height: 380,
        layout: { background: { color: 'transparent' }, textColor: '#71717a' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
        crosshair: { mode: 1 },
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22d3ee', downColor: '#d946ef', 
        borderVisible: false, wickUpColor: '#22d3ee', wickDownColor: '#d946ef'
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
    if (activeMarket === 'INDIA') return STOCKS.filter(s => s.exchange === 'NSE' || s.exchange === 'BSE');
    if (activeMarket === 'US') return STOCKS.filter(s => s.exchange === 'NASDAQ' || s.exchange === 'NYSE');
    if (activeMarket === 'CRYPTO') return STOCKS.filter(s => s.exchange === 'CRYPTO');
    return [];
  };

  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const accentColor = isBull ? 'text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]' : isHold ? 'text-zinc-300 drop-shadow-[0_0_15px_rgba(212,212,216,0.5)]' : 'text-fuchsia-500 drop-shadow-[0_0_15px_rgba(217,70,239,0.5)]';
  const bgAccent = isBull ? 'bg-cyan-500/10 border-cyan-500/30' : isHold ? 'bg-zinc-500/10 border-zinc-500/30' : 'bg-fuchsia-500/10 border-fuchsia-500/30';

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
        
        {/* HYPERSPACE VIDEO BACKGROUND */}
        <div className="fixed inset-0 z-0 pointer-events-none bg-black">
          <video autoPlay loop muted playsInline className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto object-cover -translate-x-1/2 -translate-y-1/2 opacity-60 mix-blend-screen">
            <source src="/background.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_10%,_#000000_100%)] opacity-90" />
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        </div>

        {/* 1. SEAMLESS TOP TICKER TAPE */}
        <div className="relative z-20 w-full bg-black/60 backdrop-blur-xl border-b border-white/10 overflow-hidden py-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
           <div className="flex w-[200%] sm:w-[150%] md:w-full">
              <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0">
                 <TickerContent />
              </div>
              <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0">
                 <TickerContent />
              </div>
           </div>
        </div>

        {/* 2. REFINED NAVIGATION / WIDE SEARCH BAR */}
        <nav className="relative z-20 w-full px-6 py-5 flex flex-col md:flex-row justify-between items-center gap-8 max-w-[1600px] mx-auto border-b border-white/5 bg-black/20 backdrop-blur-sm">
          
          {/* Logo & Tagline */}
          <div className="flex flex-col items-start cursor-pointer group shrink-0" onClick={() => {setTicker(null); setActiveMarket('INDIA');}}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)] group-hover:shadow-[0_0_30px_rgba(217,70,239,0.6)] transition-all">
                <span className="font-black text-black font-['Space_Grotesk'] text-xl">X</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-[0.2em] uppercase text-white font-['Space_Grotesk']">
                Signal<span className="text-cyan-400">X</span>
              </h1>
            </div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1.5 ml-[52px] font-['Space_Grotesk'] font-bold">
              The market heard we exist.
            </p>
          </div>

          {/* Expanded Search Bar */}
          <div className="flex-1 w-full max-w-4xl relative">
            <div className="absolute inset-0 bg-cyan-500/5 rounded-2xl blur-lg"></div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
              className="relative z-10 w-full bg-black/60 backdrop-blur-2xl border border-white/10 hover:border-cyan-500/50 px-8 py-5 rounded-2xl text-base font-['JetBrains_Mono'] text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all placeholder-zinc-500 shadow-2xl tracking-widest uppercase"
              placeholder="SEARCH ASSETS. NOT HOPIUM."
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-black/95 backdrop-blur-3xl border border-white/10 rounded-2xl mt-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
                {suggestions.map((stock, i) => (
                  <div key={i} onMouseDown={() => selectStock(stock)} className="flex justify-between items-center px-6 py-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 group transition-all">
                    <span className="font-bold text-zinc-300 group-hover:text-white uppercase tracking-wider font-['Space_Grotesk']">{stock.name}</span>
                    <span className="text-xs font-['JetBrains_Mono'] text-cyan-500/70 group-hover:text-cyan-400">{stock.symbol}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* 3. MAIN APP CONTAINER */}
        <main className="relative z-10 flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
          
          {/* ========================================= */}
          {/* VIEW 1: MARKET DISCOVERY HUB (No Ticker) */}
          {/* ========================================= */}
          {!ticker && (
            <div className="animate-in fade-in duration-700 w-full flex flex-col gap-8">
              
              {/* Massive Category Tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                <button 
                  onClick={() => setActiveMarket('INDIA')}
                  className={`p-6 md:p-8 rounded-3xl border backdrop-blur-xl transition-all flex flex-col items-start ${
                    activeMarket === 'INDIA' ? 'bg-cyan-900/30 border-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]' : 'bg-black/40 border-white/10 hover:bg-white/5 hover:border-white/30'
                  }`}
                >
                  <span className={`text-2xl font-black uppercase tracking-tight font-['Space_Grotesk'] ${activeMarket === 'INDIA' ? 'text-white' : 'text-zinc-400'}`}>Indian Markets</span>
                  <span className={`text-[10px] font-['JetBrains_Mono'] mt-2 uppercase tracking-widest ${activeMarket === 'INDIA' ? 'text-cyan-400' : 'text-zinc-600'}`}>NSE / BSE Equities</span>
                </button>
                
                <button 
                  onClick={() => setActiveMarket('US')}
                  className={`p-6 md:p-8 rounded-3xl border backdrop-blur-xl transition-all flex flex-col items-start ${
                    activeMarket === 'US' ? 'bg-fuchsia-900/30 border-fuchsia-400/50 shadow-[0_0_30px_rgba(217,70,239,0.2)]' : 'bg-black/40 border-white/10 hover:bg-white/5 hover:border-white/30'
                  }`}
                >
                  <span className={`text-2xl font-black uppercase tracking-tight font-['Space_Grotesk'] ${activeMarket === 'US' ? 'text-white' : 'text-zinc-400'}`}>US Markets</span>
                  <span className={`text-[10px] font-['JetBrains_Mono'] mt-2 uppercase tracking-widest ${activeMarket === 'US' ? 'text-fuchsia-400' : 'text-zinc-600'}`}>NASDAQ / NYSE</span>
                </button>

                <button 
                  onClick={() => setActiveMarket('CRYPTO')}
                  className={`p-6 md:p-8 rounded-3xl border backdrop-blur-xl transition-all flex flex-col items-start ${
                    activeMarket === 'CRYPTO' ? 'bg-zinc-800/50 border-white/50 shadow-[0_0_30px_rgba(255,255,255,0.1)]' : 'bg-black/40 border-white/10 hover:bg-white/5 hover:border-white/30'
                  }`}
                >
                  <span className={`text-2xl font-black uppercase tracking-tight font-['Space_Grotesk'] ${activeMarket === 'CRYPTO' ? 'text-white' : 'text-zinc-400'}`}>Cryptocurrency</span>
                  <span className={`text-[10px] font-['JetBrains_Mono'] mt-2 uppercase tracking-widest ${activeMarket === 'CRYPTO' ? 'text-white' : 'text-zinc-600'}`}>Digital Assets</span>
                </button>
              </div>

              {/* Dynamic Asset Grid (Expands on Hover) */}
              {activeMarket && (
                <div className="bg-black/20 backdrop-blur-md rounded-3xl p-6 border border-white/5 animate-in slide-in-from-bottom-8 fade-in duration-500">
                  <div className="flex items-center justify-between mb-6 px-2 border-b border-white/10 pb-4">
                    <h2 className="text-sm font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk']">Initializing Algorithm...</h2>
                    <span className="text-[10px] bg-white/10 px-3 py-1 rounded-full text-zinc-300 font-['JetBrains_Mono']">Live Scan: {activeMarket}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {getMarketStocks().map(s => (
                      <MarketAssetCard key={s.ticker} stock={s} onSelect={selectStock} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================= */}
          {/* VIEW 2: DASHBOARD ALGORITHMIC GRID (Ticker Selected) */}
          {/* ========================================= */}
          {ticker && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full flex flex-col gap-6">
              
              {/* Ticker Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between border-b border-white/10 pb-6 gap-4">
                <div>
                  <button onClick={() => setTicker(null)} className="text-zinc-400 font-bold uppercase text-[10px] hover:text-white transition-colors flex items-center gap-2 tracking-[0.2em] mb-4 bg-white/5 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                    ← Return Overview
                  </button>
                  <h1 className="font-black text-5xl sm:text-6xl text-white uppercase tracking-tighter font-['Space_Grotesk']">{ticker}</h1>
                </div>
                {quote && quote.price && (
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Live Asset Value</div>
                    <span className="text-4xl font-['JetBrains_Mono'] font-bold text-white tracking-tight">{currency}{quote.price}</span>
                    <div className={`text-sm font-['JetBrains_Mono'] font-bold mt-1 tracking-wider ${quote.change_percent > 0 ? 'text-cyan-400' : 'text-fuchsia-500'}`}>
                      {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                    </div>
                  </div>
                )}
              </div>

              {/* Top Row: Chart & Verdict Block */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Chart Block */}
                <div className="lg:col-span-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
                    <span className="font-bold text-xs text-zinc-400 uppercase tracking-[0.2em] font-['Space_Grotesk']">Chart Geometry</span>
                  </div>
                  {!chartData ? (
                    <div className="h-[380px] flex flex-col items-center justify-center font-['JetBrains_Mono'] text-zinc-500 gap-4 text-sm uppercase tracking-widest">
                       <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin"></div>
                       Loading Data Stream...
                    </div>
                  ) : (
                    <div ref={chartRef} className="w-full h-[380px]" />
                  )}
                </div>

                {/* Master Verdict Block */}
                {analysis && !analysis.error && (
                  <div className={`lg:col-span-4 rounded-3xl border backdrop-blur-2xl p-8 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${bgAccent}`}>
                    <div>
                      <h3 className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase mb-4 border-b border-white/10 pb-2 font-['Space_Grotesk']">Algorithm Verdict</h3>
                      <div className={`text-6xl font-black uppercase tracking-tighter mb-8 font-['Space_Grotesk'] ${accentColor}`}>{analysis.verdict}</div>
                      
                      <div className="mb-6 bg-black/40 p-4 rounded-2xl border border-white/5">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest block mb-2">FISO Math Score</span>
                        <div className="text-4xl font-['JetBrains_Mono'] font-bold text-white tracking-tighter">
                          {analysis.fiso_score}<span className="text-lg text-zinc-600 tracking-normal">/100</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-4 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-fuchsia-500 via-zinc-500 to-cyan-400" style={{ width: `${analysis.fiso_score}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-2xl p-5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest block mb-3 border-b border-white/5 pb-2">Predictive Vectors</span>
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-xs text-zinc-500 font-medium">Target Price</span>
                         <span className="font-['JetBrains_Mono'] font-bold text-cyan-400">{currency}{analysis.target}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-xs text-zinc-500 font-medium">Stop Loss</span>
                         <span className="font-['JetBrains_Mono'] font-bold text-fuchsia-500">{currency}{analysis.stop_loss}</span>
                      </div>
                      <div className="flex justify-between items-center">
                         <span className="text-xs text-zinc-500 font-medium">Timeframe</span>
                         <span className="font-['JetBrains_Mono'] font-bold text-white">{analysis.estimated_days} Days</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Row: NLP & Matrix */}
              {analysis && !analysis.error && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
                  
                  {/* News NLP */}
                  <div className="lg:col-span-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                    <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                      <h3 className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase font-['Space_Grotesk']">Global NLP Feed</h3>
                      <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border font-['JetBrains_Mono'] ${
                          analysis?.sentiment?.label === 'Bullish' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
                          analysis?.sentiment?.label === 'Bearish' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30' : 'bg-white/5 text-zinc-400 border-white/10'
                      }`}>
                        {analysis?.sentiment?.label || 'ANALYZING...'} [{analysis?.sentiment?.score || 0}]
                      </span>
                    </div>
                    
                    <ul className="space-y-4">
                      {analysis?.sentiment?.headlines?.map((headline: string, idx: number) => (
                        <li key={idx} className="text-xs text-zinc-300 leading-relaxed border-l-2 border-white/20 pl-4 py-1 tracking-wide hover:border-cyan-400 hover:text-white transition-all cursor-pointer">
                          {headline}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Strategy Matrix */}
                  <div className="lg:col-span-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                    <h3 className="text-[10px] font-bold text-zinc-400 tracking-[0.2em] uppercase mb-6 border-b border-white/10 pb-4 font-['Space_Grotesk']">Tactical Strategy Matrix</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {STRATEGIES.map((strategy) => {
                        const evalData = analysis?.strategy_evals?.[strategy.id];
                        const isBest = analysis?.best_strategy_id === strategy.id;

                        return (
                          <div
                            key={strategy.id}
                            className={`relative border rounded-2xl p-5 transition-all ${
                              isBest ? 'bg-cyan-900/20 border-cyan-400/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]' : 'bg-black/50 border-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-['JetBrains_Mono'] text-[9px] font-bold opacity-50 uppercase text-white tracking-widest">MDL-{strategy.id}</span>
                              {isBest && <span className="text-[8px] bg-cyan-400 text-black px-1.5 py-0.5 uppercase font-black rounded-sm tracking-widest">Optimal</span>}
                            </div>
                            
                            <span className="font-bold text-sm uppercase block mb-2 font-['Space_Grotesk'] text-white">{strategy.name}</span>
                            
                            {evalData && (
                              <span className="text-[10px] font-['JetBrains_Mono'] font-bold text-zinc-300 uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-1 rounded inline-block mb-3">
                                SCR: {evalData.score}
                              </span>
                            )}

                            <p className="text-xs text-zinc-500 leading-relaxed border-t border-white/5 pt-3">
                              {evalData?.desc || strategy.desc}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}