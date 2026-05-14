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
];

function getLevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr = [];
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = i === 0 ? j : Math.min(arr[i - 1][j] + 1, arr[i][j - 1] + 1, arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1));
    }
  }
  return arr[t.length][s.length];
}

// --- Icons for Ticker ---
const Icons = {
  nifty: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>,
  sensex: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  nasdaq: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  bitcoin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11.5 2v20M15.5 2v20M7 6h11c1.7 0 3 1.3 3 3s-1.3 3-3 3H7M7 12h12c1.7 0 3 1.3 3 3s-1.3 3-3 3H7"/></svg>,
  bank: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>,
  gift: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>,
  layers: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
};

// --- Top Ticker Tape Component ---
const TickerItem = ({ title, symbol, currency, icon }: { title: string, symbol: string, currency: string, icon: React.ReactNode }) => {
  const { data } = useSWR(`/api/v1/quote/${symbol}`, fetcher, { refreshInterval: 60000 });
  return (
    <div className="flex items-center gap-3 shrink-0 px-8 border-r border-amber-500/20">
      <div className="flex items-center gap-2 text-amber-500">
        {icon}
        <span className="font-bold text-[11px] tracking-widest text-amber-200 uppercase font-['Orbitron']">{title}</span>
      </div>
      {data && data.price ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-white font-bold">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md ${data.change_percent > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
            {data.change_percent > 0 ? '▲' : '▼'}{Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </div>
      ) : (
        <span className="text-xs text-amber-500/50 font-mono tracking-widest uppercase">Syncing...</span>
      )}
    </div>
  );
};

// --- Sneak Peek Hover Card Component ---
const HoverStockCard = ({ stock, onSelect }: { stock: typeof STOCKS[0], onSelect: (s: typeof STOCKS[0]) => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const { data: quote } = useSWR(isHovered ? `/api/v1/quote/${stock.ticker}` : null, fetcher);
  const { data: analysis } = useSWR(isHovered ? `/api/v1/analyze/${stock.ticker}` : null, fetcher);

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(stock)}
      className="relative border border-amber-500/20 bg-[#0a0500]/60 backdrop-blur-md p-5 hover:bg-amber-900/30 hover:border-amber-400 transition-all duration-300 cursor-pointer group rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.05)]"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] font-mono font-bold text-amber-500 group-hover:text-amber-300 transition-colors uppercase tracking-widest">{stock.symbol}</span>
      </div>
      <h3 className="font-bold text-sm text-gray-200 line-clamp-1 font-['Rajdhani'] uppercase tracking-wider">{stock.name}</h3>

      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-[#0a0500]/95 backdrop-blur-2xl border border-amber-500/50 p-5 rounded-xl shadow-[0_0_40px_rgba(245,158,11,0.3)] z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="border-b border-amber-500/20 pb-2 mb-3">
            <span className="text-[9px] uppercase tracking-widest text-amber-500 font-bold">Live Telemetry</span>
            <div className="text-xl font-black text-white font-['Orbitron']">{stock.symbol}</div>
          </div>
          
          <div className="flex justify-between items-center mb-3">
             <span className="text-xs font-bold text-gray-400 font-['Rajdhani'] uppercase">Price Vector</span>
             <span className="font-mono text-amber-300 font-bold">{quote ? `${stock.currency}${quote.price}` : 'Scanning...'}</span>
          </div>
          
          <div className="flex justify-between items-center mb-3">
             <span className="text-xs font-bold text-gray-400 font-['Rajdhani'] uppercase">Algorithm</span>
             <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border font-['Orbitron'] ${
               analysis?.verdict?.includes('Buy') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
               analysis?.verdict === 'Hold' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 
               analysis ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-gray-800 text-gray-400 border-gray-600'
             }`}>
               {analysis ? analysis.verdict : 'Evaluating...'}
             </span>
          </div>

          <div className="flex justify-between items-center">
             <span className="text-xs font-bold text-gray-400 font-['Rajdhani'] uppercase">FISO Score</span>
             <span className="font-mono font-bold text-white tracking-widest">{analysis ? `${analysis.fiso_score}/100` : '...'}</span>
          </div>
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
      return { ...s, score: Math.min(nameDist, symDist, exactMatch) };
    });
    
    const filtered = mapped.filter(s => s.score < 5).sort((a, b) => a.score - b.score).slice(0, 8);
    setSuggestions(filtered);
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
        layout: { background: { color: 'transparent' }, textColor: '#fcd34d' }, // Amber text
        grid: { vertLines: { color: 'rgba(245,158,11,0.05)' }, horzLines: { color: 'rgba(245,158,11,0.05)' } },
        crosshair: { mode: 1 },
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#34d399', downColor: '#f43f5e', 
        borderVisible: false, wickUpColor: '#34d399', wickDownColor: '#f43f5e'
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

  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const verdictText = isBull ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]' : isHold ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]';
  const verdictBg = isBull ? 'bg-emerald-900/10 border-emerald-500/30' : isHold ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-rose-900/10 border-rose-500/30';

  const TickerContent = () => (
    <>
      <TickerItem title="NIFTY 50" symbol="^NSEI" currency="" icon={Icons.nifty} />
      <TickerItem title="SENSEX" symbol="^BSESN" currency="" icon={Icons.sensex} />
      <TickerItem title="NASDAQ" symbol="^IXIC" currency="" icon={Icons.nasdaq} />
      <TickerItem title="BITCOIN" symbol="BTC-USD" currency="$" icon={Icons.bitcoin} />
      <TickerItem title="BANK NIFTY" symbol="^NSEBANK" currency="" icon={Icons.bank} />
      <TickerItem title="NIFTY 100" symbol="^CNX100" currency="" icon={Icons.layers} />
      <TickerItem title="GIFT NIFTY" symbol="^NSEMDCP50" currency="" icon={Icons.gift} />
    </>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
      `}} />
      <div className="min-h-screen text-gray-200 selection:bg-amber-500/30 selection:text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
        
        {/* High-Tech Plexus Video Background */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-black">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto object-cover -translate-x-1/2 -translate-y-1/2 opacity-50 mix-blend-screen"
          >
            <source src="/background.mp4" type="video/mp4" />
          </video>
          {/* Deep Amber/Brown overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0500]/80 via-[#0a0500]/60 to-[#0a0500]/95" />
        </div>

        {/* 1. SEAMLESS TOP TICKER TAPE (Glassmorphism & Loop) */}
        <div className="relative z-10 w-full bg-[#0a0500]/50 backdrop-blur-md border-b border-amber-500/20 overflow-hidden py-3 shadow-[0_4px_30px_rgba(245,158,11,0.05)]">
           <div className="flex w-[200%] sm:w-[150%] md:w-full">
              <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0">
                 <TickerContent />
              </div>
              <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0">
                 <TickerContent />
              </div>
           </div>
        </div>

        <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col justify-center min-h-[90vh]">
          
          {/* 2. HEADER & SEARCH */}
          <div className="flex flex-col lg:flex-row justify-between items-end mb-10 border-b border-amber-500/20 pb-8 gap-8">
            <div>
              <h1 className="text-6xl sm:text-7xl md:text-8xl font-black tracking-widest uppercase leading-none cursor-pointer text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-400 to-yellow-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.4)] font-['Orbitron']" onClick={() => setTicker(null)}>
                SignalX
              </h1>
              <p className="text-sm font-bold tracking-[0.3em] uppercase mt-3 text-amber-200/60 font-['Rajdhani']">
                Because “Trust Me Bro” Isn’t A Strategy.
              </p>
            </div>

            <div className="w-full lg:w-1/3 relative">
              <div className="absolute inset-0 bg-amber-500/10 rounded-xl blur-md"></div>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => input.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={handleKeyDown}
                className="relative z-10 w-full bg-[#0a0500]/80 backdrop-blur-xl border border-amber-500/40 px-6 py-4 rounded-xl text-lg font-mono text-amber-50 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all placeholder-amber-800 shadow-[0_0_20px_rgba(245,158,11,0.1)] uppercase tracking-widest"
                placeholder="INITIALIZE SCAN..."
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full bg-[#0a0500]/95 backdrop-blur-2xl border border-amber-500/40 rounded-xl mt-3 shadow-[0_0_30px_rgba(245,158,11,0.3)] overflow-hidden">
                  {suggestions.map((stock, i) => (
                    <div key={i} onMouseDown={() => selectStock(stock)} className="flex justify-between items-center px-6 py-4 hover:bg-amber-900/40 hover:text-white cursor-pointer border-b border-amber-500/10 last:border-0 group transition-colors">
                      <span className="font-bold text-amber-50 uppercase tracking-wider font-['Rajdhani']">{stock.name}</span>
                      <span className="text-xs font-mono font-bold text-amber-500 group-hover:text-amber-300">{stock.symbol}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. HOME OVERVIEW (No Ticker) */}
          {!ticker && (
            <div className="animate-in fade-in duration-500 flex-1">
              <div className="flex justify-center gap-4 mb-10 overflow-x-auto no-scrollbar pb-2">
                 <button 
                    onClick={() => setActiveCategory(activeCategory === 'INDIA' ? null : 'INDIA')}
                    className={`px-8 py-4 rounded-xl border text-sm font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap font-['Orbitron'] ${
                      activeCategory === 'INDIA' ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-[#0a0500]/60 backdrop-blur-sm border-amber-500/20 text-amber-600 hover:bg-amber-900/30 hover:border-amber-500/50'
                    }`}>
                   Indian Markets
                 </button>
                 <button 
                    onClick={() => setActiveCategory(activeCategory === 'US' ? null : 'US')}
                    className={`px-8 py-4 rounded-xl border text-sm font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap font-['Orbitron'] ${
                      activeCategory === 'US' ? 'bg-orange-500/20 border-orange-400 text-orange-300 shadow-[0_0_20px_rgba(249,115,22,0.3)]' : 'bg-[#0a0500]/60 backdrop-blur-sm border-amber-500/20 text-amber-600 hover:bg-orange-900/30 hover:border-orange-500/50'
                    }`}>
                   Global Markets
                 </button>
                 <button 
                    onClick={() => setActiveCategory(activeCategory === 'CRYPTO' ? null : 'CRYPTO')}
                    className={`px-8 py-4 rounded-xl border text-sm font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap font-['Orbitron'] ${
                      activeCategory === 'CRYPTO' ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.3)]' : 'bg-[#0a0500]/60 backdrop-blur-sm border-amber-500/20 text-amber-600 hover:bg-yellow-900/30 hover:border-yellow-500/50'
                    }`}>
                   Cryptocurrency
                 </button>
              </div>

              {activeCategory && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5">
                  {getCategoryStocks().map((stock, i) => (
                    <HoverStockCard key={i} stock={stock} onSelect={selectStock} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. DASHBOARD BENTO GRID (Ticker Selected) */}
          {ticker && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="mb-6 flex items-center justify-between">
                <button onClick={() => setTicker(null)} className="text-amber-500 font-bold uppercase text-xs hover:text-amber-300 transition-colors flex items-center gap-2 tracking-widest">
                  ← Return to Hub
                </button>
                <span className="font-black text-4xl text-white uppercase tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] font-['Orbitron']">{ticker}</span>
              </div>

              {/* Top Row: Chart & Verdict Block */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                
                {/* Chart Block */}
                <div className="lg:col-span-8 bg-[#0a0500]/60 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                  <div className="flex justify-between items-end mb-4 border-b border-amber-500/10 pb-4">
                    <span className="font-bold text-xs text-amber-500 uppercase tracking-[0.2em] font-['Orbitron']">Chart Geometry</span>
                    {quote && quote.price && (
                      <div className="text-right">
                        <span className="text-4xl font-mono font-bold text-white tracking-tight">{currency}{quote.price}</span>
                        <div className={`text-sm font-bold mt-1 tracking-wider ${quote.change_percent > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                        </div>
                      </div>
                    )}
                  </div>
                  {!chartData ? (
                    <div className="h-[380px] flex flex-col items-center justify-center font-mono text-amber-500/50 gap-4 text-sm uppercase tracking-[0.3em]">
                       <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-400 rounded-full animate-spin"></div>
                       Syncing Nodes...
                    </div>
                  ) : (
                    <div ref={chartRef} className="w-full h-[380px]" />
                  )}
                </div>

                {/* Master Verdict Block */}
                {analysis && !analysis.error && (
                  <div className={`lg:col-span-4 rounded-2xl border backdrop-blur-xl p-8 flex flex-col justify-between shadow-[0_0_40px_rgba(0,0,0,0.6)] ${verdictBg}`}>
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 tracking-[0.2em] uppercase mb-4 border-b border-white/10 pb-2 font-['Orbitron']">Algorithm Verdict</h3>
                      <div className={`text-6xl sm:text-7xl font-black uppercase tracking-tighter mb-8 font-['Orbitron'] ${verdictText}`}>{analysis.verdict}</div>
                      
                      <div className="mb-6">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-2">FISO Math Score</span>
                        <div className="text-4xl font-mono font-bold text-white tracking-tighter">{analysis.fiso_score}<span className="text-lg opacity-50 tracking-normal">/100</span></div>
                      </div>
                    </div>

                    <div className="bg-[#000000]/50 border border-white/5 rounded-xl p-5">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-2">Predictive Timeline</span>
                      <div className="text-2xl font-mono font-bold text-amber-400 mb-1">{analysis.estimated_days} Days</div>
                      <div className="text-xs font-mono text-amber-200/70">Target: {currency}{analysis.target}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Row: NLP & Matrix */}
              {analysis && !analysis.error && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* News NLP */}
                  <div className="lg:col-span-4 bg-[#0a0500]/60 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                    <h3 className="text-[11px] font-bold text-amber-500 tracking-[0.2em] uppercase mb-6 border-b border-amber-500/10 pb-2 font-['Orbitron']">Global NLP Feed</h3>
                    <div className="mb-6">
                      <span className={`inline-block px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-[0.2em] border font-['Orbitron'] ${
                          analysis?.sentiment?.label === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          analysis?.sentiment?.label === 'Bearish' ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' : 'bg-white/5 text-gray-300 border-white/10'
                      }`}>
                        {analysis?.sentiment?.label || 'ANALYZING...'} [{analysis?.sentiment?.score || 0}]
                      </span>
                    </div>
                    <ul className="space-y-4">
                      {analysis?.sentiment?.headlines?.map((headline: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-300 leading-relaxed border-l-2 border-amber-500/40 pl-4 py-0.5 tracking-wide font-['Rajdhani']">
                          {headline}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Strategy Matrix */}
                  <div className="lg:col-span-8 bg-[#0a0500]/60 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                    <h3 className="text-[11px] font-bold text-amber-500 tracking-[0.2em] uppercase mb-6 border-b border-amber-500/10 pb-2 font-['Orbitron']">Tactical Strategy Matrix</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {STRATEGIES.map((strategy) => {
                        const evalData = analysis?.strategy_evals?.[strategy.id];
                        const isBest = analysis?.best_strategy_id === strategy.id;
                        const isExpanded = expandedStrategyId === strategy.id;

                        return (
                          <div
                            key={strategy.id}
                            onClick={() => setExpandedStrategyId(isExpanded ? null : strategy.id)}
                            className={`relative border rounded-xl p-4 cursor-pointer transition-all ${
                              isBest ? 'bg-amber-900/30 border-amber-400 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'bg-[#000000]/50 border-amber-500/10 hover:border-amber-500/40 text-gray-300'
                            } ${isExpanded ? 'ring-1 ring-amber-400 z-20 scale-105 bg-[#0a0500]' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-mono text-[9px] font-bold opacity-50 uppercase text-amber-400 tracking-widest">MDL-{strategy.id}</span>
                              {isBest && <span className="text-[8px] bg-amber-500 text-[#000000] px-1.5 py-0.5 uppercase font-black rounded tracking-widest">Best</span>}
                            </div>
                            
                            <span className="font-bold text-xs uppercase block mb-3 font-['Orbitron'] tracking-wider">{strategy.name}</span>
                            
                            {evalData && (
                              <span className="text-[10px] font-mono text-amber-200 uppercase tracking-widest bg-amber-500/10 px-2 py-1 rounded">
                                SCR: {evalData.score}
                              </span>
                            )}

                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-amber-500/20">
                                <p className="text-xs text-gray-400 leading-relaxed font-['Rajdhani'] font-bold tracking-wide">{evalData?.desc}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}