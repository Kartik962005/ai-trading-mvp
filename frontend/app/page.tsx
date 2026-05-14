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

// --- Top Ticker Tape Component ---
const TickerItem = ({ title, symbol, currency }: { title: string, symbol: string, currency: string }) => {
  const { data } = useSWR(`/api/v1/quote/${symbol}`, fetcher, { refreshInterval: 60000 });
  return (
    <div className="flex items-center gap-3 shrink-0 px-6 border-r border-black/20">
      <span className="font-bold text-sm tracking-widest">{title}</span>
      {data && data.price ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{currency}{data.price.toLocaleString()}</span>
          <span className={`text-xs font-bold ${data.change_percent > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.change_percent > 0 ? '▲' : '▼'}{Math.abs(data.change_percent).toFixed(2)}%
          </span>
        </div>
      ) : (
        <span className="text-xs text-gray-400">Loading...</span>
      )}
    </div>
  );
};

// --- Sneak Peek Hover Card Component ---
const HoverStockCard = ({ stock, onSelect }: { stock: typeof STOCKS[0], onSelect: (s: typeof STOCKS[0]) => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Only fetch data if the user is hovering over the card to save API calls
  const { data: quote } = useSWR(isHovered ? `/api/v1/quote/${stock.ticker}` : null, fetcher);
  const { data: analysis } = useSWR(isHovered ? `/api/v1/analyze/${stock.ticker}` : null, fetcher);

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(stock)}
      className="relative border border-black/20 p-4 hover:bg-black hover:text-white transition-all duration-300 cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-mono font-bold opacity-50">{stock.symbol}</span>
      </div>
      <h3 className="font-bold text-sm line-clamp-1">{stock.name}</h3>

      {/* Floating Sneak Peek Popover */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-white text-black border-2 border-black p-4 shadow-[8px_8px_0px_rgba(0,0,0,1)] z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="border-b border-black/10 pb-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">Live Snapshot</span>
            <div className="text-xl font-black">{stock.symbol}</div>
          </div>
          
          <div className="flex justify-between items-center mb-3">
             <span className="text-xs font-bold">Price</span>
             <span className="font-mono">{quote ? `${stock.currency}${quote.price}` : '...'}</span>
          </div>
          
          <div className="flex justify-between items-center mb-3">
             <span className="text-xs font-bold">Verdict</span>
             <span className={`text-xs font-black uppercase px-2 py-1 border ${
               analysis?.verdict?.includes('Buy') ? 'bg-green-100 text-green-700 border-green-300' :
               analysis?.verdict === 'Hold' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 
               analysis ? 'bg-red-100 text-red-700 border-red-300' : 'bg-gray-100'
             }`}>
               {analysis ? analysis.verdict : 'Evaluating...'}
             </span>
          </div>

          <div className="flex justify-between items-center">
             <span className="text-xs font-bold">FISO Score</span>
             <span className="font-mono font-bold">{analysis ? `${analysis.fiso_score}/100` : '...'}</span>
          </div>

          {/* Pointy triangle at bottom of popover */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black"></div>
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
        height: 400,
        layout: { background: { color: 'transparent' }, textColor: '#000000' },
        grid: { vertLines: { color: 'rgba(0,0,0,0.05)' }, horzLines: { color: 'rgba(0,0,0,0.05)' } },
        crosshair: { mode: 1 },
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#16a34a', downColor: '#dc2626', 
        borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626'
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

  // Brutalist Color Mapping
  const isBull = analysis?.verdict?.includes('Buy');
  const isHold = analysis?.verdict === 'Hold';
  const verdictText = isBull ? 'text-green-700' : isHold ? 'text-yellow-700' : 'text-red-700';
  const verdictBg = isBull ? 'bg-green-100 border-green-300' : isHold ? 'bg-yellow-100 border-yellow-300' : 'bg-red-100 border-red-300';

  return (
    <div className="min-h-screen bg-[#f5f5f4] text-black font-sans selection:bg-black selection:text-white" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      
      {/* 1. TOP TICKER TAPE */}
      <div className="w-full bg-white border-b-2 border-black flex overflow-x-auto no-scrollbar py-2">
         <div className="flex animate-marquee whitespace-nowrap">
            <TickerItem title="NIFTY 50" symbol="^NSEI" currency="" />
            <TickerItem title="SENSEX" symbol="^BSESN" currency="" />
            <TickerItem title="NASDAQ" symbol="^IXIC" currency="" />
            <TickerItem title="BITCOIN" symbol="BTC-USD" currency="$" />
         </div>
      </div>

      <div className="p-4 sm:p-8 max-w-7xl mx-auto">
        
        {/* 2. BRUTALIST HEADER & SEARCH */}
        <div className="flex flex-col lg:flex-row justify-between items-end mb-12 border-b-4 border-black pb-8 gap-8">
          <div>
            <h1 className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tighter uppercase leading-none cursor-pointer" onClick={() => setTicker(null)}>
              SignalX.
            </h1>
            <p className="text-sm sm:text-base font-bold tracking-widest uppercase mt-2">
              Because "Trust Me Bro" Isn't A Strategy.
            </p>
          </div>

          <div className="w-full lg:w-1/3 relative">
            <div className="absolute -inset-1 bg-black translate-x-2 translate-y-2 z-0"></div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
              className="relative z-10 w-full bg-white border-2 border-black px-6 py-4 text-xl font-bold outline-none placeholder-gray-400 uppercase"
              placeholder="SEARCH ASSET..."
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-white border-2 border-black mt-4 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                {suggestions.map((stock, i) => (
                  <div key={i} onMouseDown={() => selectStock(stock)} className="flex justify-between items-center px-6 py-4 hover:bg-black hover:text-white cursor-pointer border-b border-black last:border-0 group">
                    <span className="font-bold uppercase">{stock.name}</span>
                    <span className="text-xs font-mono font-bold group-hover:text-white opacity-50">{stock.symbol}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. HOME OVERVIEW (No Ticker) */}
        {!ticker && (
          <div className="animate-in fade-in duration-500">
            <div className="flex gap-4 mb-8 border-b-2 border-black pb-8 overflow-x-auto">
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'INDIA' ? null : 'INDIA')}
                  className={`px-8 py-4 border-2 border-black font-black uppercase tracking-widest transition-all ${
                    activeCategory === 'INDIA' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                  }`}>
                 Indian Markets
               </button>
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'US' ? null : 'US')}
                  className={`px-8 py-4 border-2 border-black font-black uppercase tracking-widest transition-all ${
                    activeCategory === 'US' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                  }`}>
                 Global Markets
               </button>
               <button 
                  onClick={() => setActiveCategory(activeCategory === 'CRYPTO' ? null : 'CRYPTO')}
                  className={`px-8 py-4 border-2 border-black font-black uppercase tracking-widest transition-all ${
                    activeCategory === 'CRYPTO' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                  }`}>
                 Cryptocurrency
               </button>
            </div>

            {activeCategory && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
              <button onClick={() => setTicker(null)} className="text-black font-bold uppercase text-xs border-b-2 border-black pb-1 hover:opacity-50 transition-opacity">
                ← Return
              </button>
              <span className="font-bold text-4xl uppercase tracking-tighter">{ticker}</span>
            </div>

            {/* Top Row: Chart & Verdict Block */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
              
              {/* Chart Block */}
              <div className="lg:col-span-8 bg-white border-2 border-black p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                <div className="flex justify-between items-end mb-6 border-b-2 border-black pb-4">
                  <span className="font-bold text-sm uppercase tracking-widest">Chart Geometry</span>
                  {quote && quote.price && (
                    <div className="text-right">
                      <span className="text-4xl font-black tracking-tighter">{currency}{quote.price}</span>
                      <div className={`text-sm font-bold mt-1 ${quote.change_percent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>
                {!chartData ? (
                  <div className="h-[400px] flex items-center justify-center font-bold uppercase">Fetching...</div>
                ) : (
                  <div ref={chartRef} className="w-full h-[400px]" />
                )}
              </div>

              {/* Master Verdict Block */}
              {analysis && !analysis.error && (
                <div className={`lg:col-span-4 border-2 border-black p-6 flex flex-col justify-between shadow-[8px_8px_0px_rgba(0,0,0,1)] ${verdictBg}`}>
                  <div>
                    <h3 className="text-xs font-black tracking-widest uppercase mb-4 border-b-2 border-black/20 pb-2">Algorithm Verdict</h3>
                    <div className={`text-6xl font-black uppercase tracking-tighter mb-8 ${verdictText}`}>{analysis.verdict}</div>
                    
                    <div className="mb-6">
                      <span className="text-[10px] font-black uppercase tracking-widest block mb-2">FISO Math Score</span>
                      <div className="text-4xl font-black">{analysis.fiso_score}<span className="text-lg opacity-50">/100</span></div>
                    </div>
                  </div>

                  <div className="bg-white border-2 border-black p-4">
                    <span className="text-[10px] font-black uppercase tracking-widest block mb-2">Predictive Timeline</span>
                    <div className="text-2xl font-black mb-1">{analysis.estimated_days} Days</div>
                    <div className="text-xs font-bold opacity-70">Target: {currency}{analysis.target}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Row: NLP & Matrix */}
            {analysis && !analysis.error && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* News NLP */}
                <div className="lg:col-span-4 bg-white border-2 border-black p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                  <h3 className="text-xs font-black tracking-widest uppercase mb-6 border-b-2 border-black pb-2">Global NLP Feed</h3>
                  <div className="mb-6">
                    <span className={`inline-block px-3 py-1 border-2 border-black font-black uppercase text-xs ${
                        analysis?.sentiment?.label === 'Bullish' ? 'bg-green-100 text-green-700' :
                        analysis?.sentiment?.label === 'Bearish' ? 'bg-red-100 text-red-700' : 'bg-gray-100'
                    }`}>
                      {analysis?.sentiment?.label || 'ANALYZING...'} [{analysis?.sentiment?.score || 0}]
                    </span>
                  </div>
                  <ul className="space-y-4">
                    {analysis?.sentiment?.headlines?.map((headline: string, idx: number) => (
                      <li key={idx} className="text-sm font-bold leading-tight border-l-4 border-black pl-3 py-1">
                        {headline}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Strategy Matrix */}
                <div className="lg:col-span-8 bg-white border-2 border-black p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                  <h3 className="text-xs font-black tracking-widest uppercase mb-6 border-b-2 border-black pb-2">Tactical Strategy Matrix</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {STRATEGIES.map((strategy) => {
                      const evalData = analysis?.strategy_evals?.[strategy.id];
                      const isBest = analysis?.best_strategy_id === strategy.id;
                      const isExpanded = expandedStrategyId === strategy.id;

                      return (
                        <div
                          key={strategy.id}
                          onClick={() => setExpandedStrategyId(isExpanded ? null : strategy.id)}
                          className={`relative border-2 border-black p-4 cursor-pointer transition-colors ${
                            isBest ? 'bg-black text-white' : 'bg-white hover:bg-gray-100 text-black'
                          } ${isExpanded ? 'ring-4 ring-black z-20 scale-105' : ''}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-mono text-[10px] font-bold opacity-50 uppercase">MDL-{strategy.id}</span>
                            {isBest && <span className="text-[8px] bg-white text-black px-1 py-0.5 uppercase font-black">Best</span>}
                          </div>
                          
                          <span className="font-black text-sm uppercase block mb-2">{strategy.name}</span>
                          
                          {evalData && (
                            <span className="text-xs font-bold uppercase tracking-widest">
                              SCR: {evalData.score}
                            </span>
                          )}

                          {isExpanded && (
                            <div className={`mt-4 pt-4 ${isBest ? 'border-white/20' : 'border-black/20'} border-t-2`}>
                              <p className="text-xs font-bold leading-snug">{evalData?.desc}</p>
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
  );
}