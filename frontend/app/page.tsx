'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`https://ai-trading-backend-jhcl.onrender.com${url}`).then(res => res.json());

const STOCKS = [
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
  { id: 1,  name: 'Moving Average Crossover', desc: 'SMA50 > SMA200 indicating macro trend' },
  { id: 2,  name: 'EMA Pullback Strategy', desc: 'Price pulling back to dynamic EMA20 support' },
  { id: 3,  name: 'Supertrend Strategy', desc: 'Captures trend continuation while filtering noise' },
  { id: 4,  name: 'Breakout Trading', desc: 'Price breaking major resistance with volume' },
  { id: 5,  name: 'Trendline Retest', desc: 'Breakout followed by support confirmation' },
  { id: 6,  name: 'Volume Anomaly', desc: 'Sudden abnormal volume equals whale activity' },
  { id: 7,  name: 'Relative Strength', desc: 'Trading strongest assets in strong sectors' },
  { id: 8,  name: 'Momentum Ignition', desc: 'Price accelerating + rising volume' },
  { id: 9,  name: 'VWAP Trend Strategy', desc: 'Above VWAP equals bullish institutional control' },
  { id: 10, name: 'Gap-Up Momentum', desc: 'Gap-up open + high volume continuation' },
  { id: 11, name: 'RSI Divergence', desc: 'Price makes new high, RSI weakens' },
  { id: 12, name: 'MACD Divergence', desc: 'Detects weakening trend before reversal' },
  { id: 13, name: 'Mean Reversion', desc: 'Extreme deviation from SMA200 statistically reverts' },
  { id: 14, name: 'Bollinger Reversal', desc: 'Price stretched outside normal standard deviations' },
  { id: 15, name: 'Volatility Expansion', desc: 'Low volatility leads to explosive incoming move' },
  { id: 16, name: 'ATR Breakout', desc: 'Price spread expands past average true range' },
  { id: 17, name: 'Liquidity Sweep', desc: 'Market hunts stop losses first, then reverses' },
  { id: 18, name: 'Order Block SMC', desc: 'Institutions leave footprint in price zones' },
  { id: 19, name: 'S/R Flip Strategy', desc: 'Major resistance breaks and becomes new support' },
  { id: 20, name: 'Multi-Factor AI Strategy', desc: 'Combines trend, volume, momentum, and sentiment' },
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
    <div className="flex items-center gap-3 shrink-0 px-8 border-r border-amber-500/30">
      <div className="flex items-center gap-2 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
        <span className="font-bold text-[11px] tracking-widest text-amber-200 uppercase font-['Orbitron']">{title}</span>
      </div>
      {data && data.price ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-white font-bold">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md ${data.change_percent > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
            {data.change_percent > 0 ? '▲' : '▼'}{Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </div>
      ) : (
        <span className="text-xs text-amber-500/50 font-mono tracking-widest uppercase">Syncing...</span>
      )}
    </div>
  );
};

const MarketAssetCard = ({ stock, onSelect }: { stock: typeof STOCKS[0], onSelect: (s: typeof STOCKS[0]) => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  const { data: quote } = useSWR(isHovered ? `/api/v1/quote/${stock.ticker}` : null, fetcher);
  const { data: analysis } = useSWR(isHovered ? `/api/v1/analyze/${stock.ticker}` : null, fetcher);

  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const verdictColor = isBull ? 'text-emerald-400' : isHold ? 'text-yellow-400' : 'text-rose-400';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(stock)}
      className="relative p-4 border border-amber-500/20 bg-[#0a0500]/60 backdrop-blur-md rounded-2xl hover:border-amber-400 hover:bg-amber-900/30 transition-all duration-300 cursor-pointer group flex flex-col justify-start overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.05)]"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] font-bold text-amber-500 group-hover:text-amber-300 font-['JetBrains_Mono'] transition-colors tracking-widest">{stock.symbol}</span>
        <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-zinc-400 font-['JetBrains_Mono']">{stock.exchange}</span>
      </div>
      <div className="font-bold text-sm text-gray-200 group-hover:text-white font-['Rajdhani'] uppercase tracking-wider truncate">{stock.name}</div>

      <div className={`transition-all duration-300 ease-in-out ${isHovered ? 'max-h-40 opacity-100 mt-4 border-t border-amber-500/20 pt-4' : 'max-h-0 opacity-0'}`}>
        {analysis && !analysis.error ? (
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Verdict</span>
              <span className={`text-sm font-black uppercase tracking-widest font-['Orbitron'] ${verdictColor}`}>{analysis.verdict}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">FISO Score</span>
              <span className="text-sm font-['JetBrains_Mono'] text-white font-bold">{analysis.fiso_score}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Confidence</span>
              <span className="text-sm font-['JetBrains_Mono'] text-white font-bold">{analysis.confidence}%</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
             <span className="text-[9px] text-amber-500/70 animate-pulse font-['JetBrains_Mono'] tracking-[0.2em]">INITIALIZING ALGORITHM...</span>
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
  const [expandedStrategyId, setExpandedStrategyId] = useState<number | null>(null);
  
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
        layout: { background: { color: 'transparent' }, textColor: '#fcd34d' },
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

  const getMarketStocks = () => {
    if (activeMarket === 'INDIA') return STOCKS.filter(s => s.exchange === 'NSE' || s.exchange === 'BSE');
    if (activeMarket === 'US') return STOCKS.filter(s => s.exchange === 'NASDAQ' || s.exchange === 'NYSE');
    if (activeMarket === 'CRYPTO') return STOCKS.filter(s => s.exchange === 'CRYPTO');
    return [];
  };

  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const verdictText = isBull ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]' : isHold ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]';
  const verdictBg = isBull ? 'bg-emerald-900/10 border-emerald-500/40' : isHold ? 'bg-yellow-900/10 border-yellow-500/40' : 'bg-rose-900/10 border-rose-500/40';

  const TickerContent = () => (
    <>
      <TickerItem title="NIFTY 50" symbol="^NSEI" currency="" />
      <TickerItem title="SENSEX" symbol="^BSESN" currency="" />
      <TickerItem title="NASDAQ" symbol="^IXIC" currency="" />
      <TickerItem title="BITCOIN" symbol="BTC-USD" currency="$" />
      <TickerItem title="BANK NIFTY" symbol="^NSEBANK" currency="" />
      <TickerItem title="GIFT NIFTY" symbol="^NSEMDCP50" currency="" />
    </>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 35s linear infinite; }
      `}} />
      <div className="min-h-screen text-gray-200 selection:bg-amber-500/30 selection:text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
        
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-black">
          <video autoPlay loop muted playsInline className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto object-cover -translate-x-1/2 -translate-y-1/2 opacity-75 mix-blend-screen">
            <source src="/background.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0500]/50 via-[#0a0500]/30 to-[#0a0500]/80" />
        </div>

        <div className="relative z-10 w-full bg-[#0a0500]/40 backdrop-blur-md border-b border-amber-500/30 overflow-hidden py-3 shadow-[0_4px_30px_rgba(245,158,11,0.1)]">
           <div className="flex w-[200%] sm:w-[150%] md:w-full">
              <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0"><TickerContent /></div>
              <div className="flex animate-marquee whitespace-nowrap min-w-full justify-around shrink-0"><TickerContent /></div>
           </div>
        </div>

        <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col justify-center min-h-[90vh]">
          
          <div className="flex flex-col items-center text-center mb-12">
            <h1 className="text-6xl sm:text-7xl md:text-8xl font-black tracking-widest uppercase leading-none cursor-pointer text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-400 to-yellow-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] font-['Orbitron'] mb-4" onClick={() => setTicker(null)}>
              SignalX
            </h1>
            <p className="text-xs font-bold tracking-[0.3em] uppercase text-amber-300/80 font-['Rajdhani'] drop-shadow-md">
              THE MARKET HEARD WE EXIST.
            </p>

            <div className="w-full max-w-4xl relative mt-10">
              <div className="absolute inset-0 bg-amber-500/20 rounded-xl blur-lg"></div>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => input.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={handleKeyDown}
                className="relative z-10 w-full bg-[#0a0500]/60 backdrop-blur-xl border border-amber-500/50 px-8 py-5 rounded-xl text-lg font-mono text-amber-50 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all placeholder-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.2)] uppercase tracking-widest text-center sm:text-left"
                placeholder="SEARCH ASSETS. NOT HOPIUM."
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full bg-[#0a0500]/95 backdrop-blur-2xl border border-amber-500/50 rounded-xl mt-3 shadow-[0_0_30px_rgba(245,158,11,0.4)] overflow-hidden text-left">
                  {suggestions.map((stock, i) => (
                    <div key={i} onMouseDown={() => selectStock(stock)} className="flex justify-between items-center px-6 py-4 hover:bg-amber-900/50 hover:text-white cursor-pointer border-b border-amber-500/20 last:border-0 group transition-colors">
                      <span className="font-bold text-amber-50 uppercase tracking-wider font-['Rajdhani']">{stock.name}</span>
                      <span className="text-xs font-mono font-bold text-amber-400 group-hover:text-amber-200">{stock.symbol}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!ticker && (
            <div className="animate-in fade-in duration-500 flex-1 w-full mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10 max-w-4xl mx-auto">
                 <button 
                    onClick={() => setActiveCategory('INDIA')}
                    className={`px-8 py-6 rounded-2xl border text-sm font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap font-['Orbitron'] ${
                      activeMarket === 'INDIA' ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-[0_0_25px_rgba(245,158,11,0.4)]' : 'bg-[#0a0500]/60 backdrop-blur-xl border-amber-500/30 text-amber-500 hover:bg-amber-900/50 hover:border-amber-400'
                    }`}>
                   Indian Markets
                 </button>
                 <button 
                    onClick={() => setActiveCategory('US')}
                    className={`px-8 py-6 rounded-2xl border text-sm font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap font-['Orbitron'] ${
                      activeMarket === 'US' ? 'bg-orange-500/30 border-orange-400 text-orange-200 shadow-[0_0_25px_rgba(249,115,22,0.4)]' : 'bg-[#0a0500]/60 backdrop-blur-xl border-amber-500/30 text-amber-500 hover:bg-orange-900/50 hover:border-orange-400'
                    }`}>
                   Global Markets
                 </button>
                 <button 
                    onClick={() => setActiveCategory('CRYPTO')}
                    className={`px-8 py-6 rounded-2xl border text-sm font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap font-['Orbitron'] ${
                      activeMarket === 'CRYPTO' ? 'bg-yellow-500/30 border-yellow-400 text-yellow-200 shadow-[0_0_25px_rgba(234,179,8,0.4)]' : 'bg-[#0a0500]/60 backdrop-blur-xl border-amber-500/30 text-amber-500 hover:bg-yellow-900/50 hover:border-yellow-400'
                    }`}>
                   Cryptocurrency
                 </button>
              </div>

              {activeMarket && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5 animate-in slide-in-from-bottom-8 fade-in duration-500">
                  {getMarketStocks().map((stock, i) => (
                    <MarketAssetCard key={i} stock={stock} onSelect={selectStock} />
                  ))}
                </div>
              )}
            </div>
          )}

          {ticker && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
              <div className="mb-6 flex items-center justify-between">
                <button onClick={() => setTicker(null)} className="text-amber-500 font-bold uppercase text-xs hover:text-amber-300 transition-colors flex items-center gap-2 tracking-widest bg-[#0a0500]/60 px-4 py-2 rounded-lg border border-amber-500/30 backdrop-blur-md">
                  ← Return to Hub
                </button>
                <span className="font-black text-4xl text-white uppercase tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] font-['Orbitron']">{ticker}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                <div className="lg:col-span-8 bg-[#0a0500]/50 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                  <div className="flex justify-between items-end mb-4 border-b border-amber-500/20 pb-4">
                    <span className="font-bold text-xs text-amber-400 uppercase tracking-[0.2em] font-['Orbitron']">Chart Geometry</span>
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
                    <div className="h-[380px] flex flex-col items-center justify-center font-mono text-amber-500/70 gap-4 text-sm uppercase tracking-[0.3em]">
                       <div className="w-10 h-10 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin"></div>
                       Syncing Nodes...
                    </div>
                  ) : (
                    <div ref={chartRef} className="w-full h-[380px]" />
                  )}
                </div>

                {analysis && !analysis.error && (
                  <div className={`lg:col-span-4 rounded-2xl border backdrop-blur-xl p-8 flex flex-col justify-between shadow-[0_0_40px_rgba(0,0,0,0.6)] ${verdictBg}`}>
                    <div>
                      <h3 className="text-xs font-bold text-gray-300 tracking-[0.2em] uppercase mb-4 border-b border-amber-500/20 pb-2 font-['Orbitron']">Algorithm Verdict</h3>
                      <div className={`text-6xl sm:text-7xl font-black uppercase tracking-tighter mb-8 font-['Orbitron'] ${verdictText}`}>{analysis.verdict}</div>
                      
                      <div className="mb-6">
                        <span className="text-[10px] text-amber-400/80 font-bold uppercase tracking-widest block mb-2">FISO Math Score</span>
                        <div className="text-4xl font-mono font-bold text-white tracking-tighter">{analysis.fiso_score}<span className="text-lg opacity-50 tracking-normal text-amber-500">/100</span></div>
                      </div>
                    </div>
                    <div className="bg-[#000000]/60 border border-amber-500/20 rounded-xl p-5">
                      <span className="text-[10px] text-amber-400/80 font-bold uppercase tracking-widest block mb-2">Predictive Timeline</span>
                      <div className="text-2xl font-mono font-bold text-amber-300 mb-1">{analysis.estimated_days} Days</div>
                      <div className="text-xs font-mono text-amber-200/70">Target: {currency}{analysis.target}</div>
                    </div>
                  </div>
                )}
              </div>

              {analysis && !analysis.error && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
                  <div className="lg:col-span-4 bg-[#0a0500]/50 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                    <h3 className="text-[11px] font-bold text-amber-400 tracking-[0.2em] uppercase mb-6 border-b border-amber-500/20 pb-2 font-['Orbitron']">Global NLP Feed</h3>
                    <div className="mb-6">
                      <span className={`inline-block px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-[0.2em] border font-['Orbitron'] ${
                          analysis?.sentiment?.label === 'Bullish' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                          analysis?.sentiment?.label === 'Bearish' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-white/10 text-gray-200 border-white/20'
                      }`}>
                        {analysis?.sentiment?.label || 'ANALYZING...'} [{analysis?.sentiment?.score || 0}]
                      </span>
                    </div>
                    <ul className="space-y-4">
                      {analysis?.sentiment?.headlines?.map((headline: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-200 leading-relaxed border-l-2 border-amber-500/60 pl-4 py-0.5 tracking-wide font-['Rajdhani']">
                          {headline}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="lg:col-span-8 bg-[#0a0500]/50 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                    <h3 className="text-[11px] font-bold text-amber-400 tracking-[0.2em] uppercase mb-6 border-b border-amber-500/20 pb-2 font-['Orbitron']">Tactical Strategy Matrix</h3>
                    
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
                              isBest ? 'bg-amber-900/40 border-amber-400 text-white shadow-[0_0_25px_rgba(245,158,11,0.3)]' : 'bg-[#000000]/60 border-amber-500/20 hover:border-amber-500/60 text-gray-300'
                            } ${isExpanded ? 'ring-1 ring-amber-400 z-20 scale-105 bg-[#0a0500]' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-mono text-[9px] font-bold opacity-70 uppercase text-amber-400 tracking-widest">MDL-{strategy.id}</span>
                              {isBest && <span className="text-[8px] bg-amber-500 text-[#000000] px-1.5 py-0.5 uppercase font-black rounded tracking-widest">Best</span>}
                            </div>
                            
                            <span className="font-bold text-xs uppercase block mb-3 font-['Orbitron'] tracking-wider">{strategy.name}</span>
                            
                            {evalData && (
                              <span className="text-[10px] font-mono text-amber-100 uppercase tracking-widest bg-amber-500/20 border border-amber-500/30 px-2 py-1 rounded">
                                SCORE: {evalData.score}
                              </span>
                            )}

                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-amber-500/30">
                                <p className="text-xs text-gray-300 leading-relaxed font-['Rajdhani'] font-bold tracking-wide">{evalData?.desc}</p>
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