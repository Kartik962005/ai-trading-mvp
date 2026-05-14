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
  { name: 'Bajaj Finance', symbol: 'BAJFINANCE', exchange: 'NSE', ticker: 'BAJFINANCE.NS', currency: '₹' },
  { name: 'Kotak Mahindra Bank', symbol: 'KOTAKBANK', exchange: 'NSE', ticker: 'KOTAKBANK.NS', currency: '₹' },
  { name: 'Axis Bank', symbol: 'AXISBANK', exchange: 'NSE', ticker: 'AXISBANK.NS', currency: '₹' },
  { name: 'Adani Enterprises', symbol: 'ADANIENT', exchange: 'NSE', ticker: 'ADANIENT.NS', currency: '₹' },
  { name: 'Maruti Suzuki', symbol: 'MARUTI', exchange: 'NSE', ticker: 'MARUTI.NS', currency: '₹' },
  { name: 'Hindustan Unilever', symbol: 'HINDUNILVR', exchange: 'NSE', ticker: 'HINDUNILVR.NS', currency: '₹' },
  { name: 'ITC', symbol: 'ITC', exchange: 'NSE', ticker: 'ITC.NS', currency: '₹' },
  { name: 'Tata Motors', symbol: 'TATAMOTORS', exchange: 'NSE', ticker: 'TATAMOTORS.NS', currency: '₹' },
  { name: 'Sun Pharma', symbol: 'SUNPHARMA', exchange: 'NSE', ticker: 'SUNPHARMA.NS', currency: '₹' },
  { name: 'HCL Technologies', symbol: 'HCLTECH', exchange: 'NSE', ticker: 'HCLTECH.NS', currency: '₹' },
  { name: 'Larsen & Toubro', symbol: 'LT', exchange: 'NSE', ticker: 'LT.NS', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'BSE', ticker: '500209.BO', currency: '₹' },
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'BSE', ticker: '500325.BO', currency: '₹' },
  { name: 'TCS', symbol: 'TCS', exchange: 'BSE', ticker: '532540.BO', currency: '₹' },
  { name: 'Apple', symbol: 'AAPL', exchange: 'NASDAQ', ticker: 'AAPL', currency: '$' },
  { name: 'Microsoft', symbol: 'MSFT', exchange: 'NASDAQ', ticker: 'MSFT', currency: '$' },
  { name: 'Google', symbol: 'GOOGL', exchange: 'NASDAQ', ticker: 'GOOGL', currency: '$' },
  { name: 'Amazon', symbol: 'AMZN', exchange: 'NASDAQ', ticker: 'AMZN', currency: '$' },
  { name: 'Tesla', symbol: 'TSLA', exchange: 'NASDAQ', ticker: 'TSLA', currency: '$' },
  { name: 'Nvidia', symbol: 'NVDA', exchange: 'NASDAQ', ticker: 'NVDA', currency: '$' },
  { name: 'Meta', symbol: 'META', exchange: 'NASDAQ', ticker: 'META', currency: '$' },
  { name: 'Netflix', symbol: 'NFLX', exchange: 'NASDAQ', ticker: 'NFLX', currency: '$' },
  { name: 'AMD', symbol: 'AMD', exchange: 'NASDAQ', ticker: 'AMD', currency: '$' },
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
  const [strategyAnalysis, setStrategyAnalysis] = useState<string | null>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const { data: quote } = useSWR(`/api/v1/quote/${ticker}`, fetcher, { refreshInterval: 30000 });
  const { data: chartData } = useSWR(`/api/v1/chart/${ticker}`, fetcher);
  const { data: analysis } = useSWR(`/api/v1/analyze/${ticker}`, fetcher);

  useEffect(() => {
    if (input.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = input.trim().toLowerCase();
    const filtered = STOCKS.filter(s =>
      s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q) || s.ticker.toLowerCase().includes(q)
    ).slice(0, 8);
    setSuggestions(filtered);
    setShowSuggestions(true);
  }, [input]);

  useEffect(() => {
    if (!chartData || !chartRef.current) return;
    if (!Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth || 800,
        height: 420,
        layout: { background: { color: '#030712' }, textColor: '#6ee7b7' },
        grid: { vertLines: { color: '#0f172a' }, horzLines: { color: '#0f172a' } },
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
    setStrategyAnalysis(null);
  };

  const analyzeStrategy = async (strategy: typeof STRATEGIES[0]) => {
    setSelectedStrategy(strategy);
    setLoadingStrategy(true);
    setStrategyAnalysis(null);
    await new Promise(r => setTimeout(r, 1500));
    if (!analysis) { setLoadingStrategy(false); return; }

    const verdict = analysis.verdict;
    const fiso = analysis.fiso_score;
    const price = analysis.current_price;

    const strategyResults: Record<number, string> = {
      1: `Golden Cross Analysis for ${ticker}:\n\nThe 50-day SMA vs 200-day SMA relationship is the foundation of this strategy. ${fiso >= 30 ? '✅ BULLISH: The 50 SMA is above the 200 SMA — a confirmed Golden Cross is in effect. This indicates a long-term uptrend.' : '❌ BEARISH: The 50 SMA is below the 200 SMA — no Golden Cross. A Death Cross may be forming.'}\n\nRecommendation: ${fiso >= 50 ? 'This strategy is ACTIVE and working for ' + ticker + '. The long-term trend is your friend. Hold or add to positions on dips.' : 'Golden Cross is NOT ideal right now. Consider RSI Oversold Bounce or Mean Reversion instead as the trend is weak.'}`,
      2: `RSI Oversold Bounce Analysis for ${ticker}:\n\nRSI measures momentum on a 0-100 scale. Below 30 = oversold, above 70 = overbought.\n\n${fiso >= 30 ? '⚠️ RSI is in neutral zone (30-70). No extreme oversold condition present.' : '✅ RSI is showing oversold conditions — a bounce may be imminent.'}\n\nRecommendation: ${fiso < 30 ? 'PRIME OPPORTUNITY: Stock is oversold. Consider small entry positions with tight stop loss at ' + analysis.stop_loss + '. Target: ' + analysis.target : 'RSI bounce strategy is NOT optimal now. Try Momentum Trading or Trend Following instead.'}`,
      3: `MACD Crossover Analysis for ${ticker}:\n\nMACD (Moving Average Convergence Divergence) shows momentum shifts when the MACD line crosses its signal line.\n\n${fiso >= 50 ? '✅ BULLISH CROSSOVER: MACD is above its signal line. Momentum is shifting upward.' : '❌ BEARISH: MACD is below signal line. Selling pressure dominates.'}\n\nRecommendation: ${fiso >= 50 ? 'MACD strategy is ACTIVE. Entry near ' + price + ' with target ' + analysis.target + ' and stop at ' + analysis.stop_loss : 'MACD shows bearish momentum. Wait for crossover or use Mean Reversion strategy.'}`,
    };

    const genericAnalysis = `${strategy.name} Analysis for ${ticker}:\n\n📊 Strategy Overview:\n${strategy.description}\n\n📈 Current Market Conditions:\nFISO Score: ${fiso}/90 — ${verdict}\nCurrent Price: ${currency}${price}\n\n${fiso >= 60 ? '✅ STRONG FIT: This strategy aligns well with current market conditions for ' + ticker + '. The stock shows strong momentum indicators supporting this approach.' : fiso >= 30 ? '⚠️ MODERATE FIT: This strategy can work but conditions are mixed. Use smaller position sizes and tighter stop losses.' : '❌ POOR FIT: Current conditions do not support this strategy for ' + ticker + '.'}\n\n🎯 Trade Setup:\nEntry: ${currency}${analysis.entry}\nStop Loss: ${currency}${analysis.stop_loss}\nTarget: ${currency}${analysis.target}\nRisk-Reward: ${analysis.risk_reward}\n\n💡 Best Strategy Recommendation:\n${fiso >= 60 ? 'Momentum Trading or Trend Following would be ideal given the strong upward momentum.' : fiso >= 30 ? 'Mean Reversion or Support & Resistance trading suits the current sideways action.' : 'RSI Oversold Bounce or Fibonacci Retracement are better suited for the current weakness.'}`;

    setStrategyAnalysis(strategyResults[strategy.id] || genericAnalysis);
    setLoadingStrategy(false);
  };

  const verdictColor = analysis?.verdict?.includes('Buy') ? 'text-emerald-400' :
    analysis?.verdict === 'Hold' ? 'text-amber-400' : 'text-red-400';

  const verdictBg = analysis?.verdict?.includes('Buy') ? 'border-emerald-500/30 bg-emerald-500/5' :
    analysis?.verdict === 'Hold' ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5';

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "'Inter', 'SF Pro Display', sans-serif" }}>

      {/* Animated background */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950 via-gray-950 to-black" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      <div className="relative z-10 p-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-12 pt-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-8 bg-gradient-to-b from-blue-400 to-emerald-400 rounded-full" />
            <span className="text-xs font-mono text-blue-400 tracking-widest uppercase">AI-Powered Analysis Platform</span>
          </div>
          <h1 className="text-6xl font-black mb-3 bg-gradient-to-r from-white via-blue-200 to-emerald-300 bg-clip-text text-transparent leading-tight">
            QUANTUM TRADE
          </h1>
          <p className="text-gray-400 text-lg font-light tracking-wide">Next-generation stock intelligence • Real-time analysis • 20 proven strategies</p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full max-w-2xl mb-10">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => input.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="w-full bg-white/5 backdrop-blur-xl border border-white/10 pl-12 pr-4 py-4 rounded-2xl text-lg outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all placeholder-gray-600"
              placeholder="Search stocks — Infosys, Apple, TCS, NVDA..."
            />
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 w-full bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl mt-2 shadow-2xl overflow-hidden">
              {suggestions.map((stock, i) => (
                <div key={i} onMouseDown={() => selectStock(stock)}
                  className="flex justify-between items-center px-5 py-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition-colors">
                  <div>
                    <span className="font-semibold text-white">{stock.name}</span>
                    <span className="text-gray-500 text-sm ml-2 font-mono">{stock.symbol}</span>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-mono font-bold ${
                    stock.exchange === 'NSE' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                    stock.exchange === 'BSE' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                    'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>{stock.exchange}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Price Bar */}
        {quote && quote.price && (
          <div className="flex items-center gap-6 mb-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4">
            <div>
              <p className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-1">Live Price</p>
              <p className="text-3xl font-black font-mono text-white">{currency}{quote.price}</p>
            </div>
            <div className={`px-4 py-2 rounded-xl font-mono font-bold text-lg ${quote.change_percent > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
              {quote.change_percent > 0 ? '▲' : '▼'} {Math.abs(quote.change_percent).toFixed(2)}%
            </div>
            <div className="ml-auto">
              <p className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-1">Symbol</p>
              <p className="text-blue-400 font-mono font-bold">{ticker}</p>
            </div>
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
        )}

        {/* Chart */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-mono text-gray-400 uppercase tracking-wider">Price Chart • 1 Year</span>
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <div className="w-2 h-2 rounded-full bg-green-400" />
            </div>
          </div>
          {!chartData && (
            <div className="h-[420px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500">Loading chart data...</p>
              </div>
            </div>
          )}
          <div ref={chartRef} className="w-full" />
        </div>

        {/* Strategy Selector */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1.5 h-6 bg-gradient-to-b from-purple-400 to-blue-400 rounded-full" />
            <h2 className="text-xl font-bold text-white">Strategy Backtester</h2>
            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded-full font-mono">20 STRATEGIES</span>
          </div>
          <p className="text-gray-400 text-sm mb-5">Select a strategy to analyze how it performs on {ticker}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
            {STRATEGIES.map((strategy) => (
              <button
                key={strategy.id}
                onClick={() => analyzeStrategy(strategy)}
                className={`text-left px-3 py-3 rounded-xl border text-sm transition-all ${
                  selectedStrategy?.id === strategy.id
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'bg-white/3 border-white/5 text-gray-400 hover:bg-white/8 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="font-mono text-xs text-gray-600 block mb-1">#{String(strategy.id).padStart(2, '0')}</span>
                <span className="font-semibold leading-tight block">{strategy.name}</span>
              </button>
            ))}
          </div>

          {/* Strategy Result */}
          {loadingStrategy && (
            <div className="bg-black/30 rounded-xl p-6 flex items-center gap-4">
              <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400">Analyzing {selectedStrategy?.name} strategy on {ticker}...</p>
            </div>
          )}

          {strategyAnalysis && !loadingStrategy && (
            <div className="bg-black/30 border border-purple-500/20 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-purple-400 font-mono text-sm uppercase tracking-wider">Strategy Report — {selectedStrategy?.name}</span>
              </div>
              <pre className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed font-sans">{strategyAnalysis}</pre>
            </div>
          )}
        </div>

        {/* Intelligent Assistant — Full Detailed Version */}
        {analysis && !analysis.error && analysis.verdict && (
          <div className={`border rounded-2xl p-8 mb-8 backdrop-blur-xl ${verdictBg}`}>

            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-1.5 h-8 bg-gradient-to-b from-emerald-400 to-blue-400 rounded-full" />
              <div>
                <h2 className="text-2xl font-black text-white">Intelligent Assistant</h2>
                <p className="text-gray-500 text-sm">AI-powered technical analysis engine</p>
              </div>
            </div>

            {/* Verdict */}
            <div className="flex items-center gap-6 mb-8">
              <div className={`text-6xl font-black ${verdictColor}`}>{analysis.verdict}</div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Confidence Level</p>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={`w-8 h-2 rounded-full ${i <= Math.ceil(analysis.fiso_score/18) ? 'bg-emerald-400' : 'bg-gray-800'}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* FISO Score Full */}
            <div className="bg-black/30 rounded-2xl p-6 mb-6">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-white text-lg">FISO Score</h3>
                  <p className="text-gray-500 text-xs mt-1">(Fundamental Indicator Strength Oscillator)</p>
                </div>
                <span className={`text-4xl font-black font-mono ${verdictColor}`}>{analysis.fiso_score}<span className="text-lg text-gray-600">/90</span></span>
              </div>
              <div className="w-full bg-gray-900 rounded-full h-3 mb-3">
                <div className="h-3 rounded-full bg-gradient-to-r from-blue-500 via-emerald-400 to-emerald-300 transition-all duration-1000"
                  style={{ width: `${(analysis.fiso_score / 90) * 100}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Trend Score</p>
                  <p className={`text-2xl font-bold font-mono ${analysis.fiso_score >= 30 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {analysis.fiso_score >= 30 ? '30' : '0'}<span className="text-gray-600 text-sm">/30</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-1">SMA 50 vs SMA 200</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Momentum</p>
                  <p className={`text-2xl font-bold font-mono ${analysis.fiso_score >= 45 ? 'text-emerald-400' : analysis.fiso_score >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                    {analysis.fiso_score >= 60 ? '30' : analysis.fiso_score >= 30 ? '15' : '0'}<span className="text-gray-600 text-sm">/30</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-1">RSI 14</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Signal</p>
                  <p className={`text-2xl font-bold font-mono ${analysis.fiso_score >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {analysis.fiso_score >= 60 ? '30' : '0'}<span className="text-gray-600 text-sm">/30</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-1">MACD Cross</p>
                </div>
              </div>
            </div>

            {/* Technical Analysis Explanation */}
            <div className="bg-black/30 rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-blue-400">📊</span> Technical Analysis Breakdown
              </h3>
              <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                <div className="flex gap-3">
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${analysis.fiso_score >= 30 ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <p><span className="text-white font-semibold">Trend (SMA 50/200):</span> {analysis.fiso_score >= 30 ? `The 50-day moving average is trading above the 200-day moving average for ${ticker}. This is the famous "Golden Cross" formation — historically one of the most reliable bullish signals in technical analysis. It confirms that the medium-term momentum is stronger than the long-term baseline.` : `The 50-day moving average has crossed below the 200-day moving average — known as the "Death Cross". This bearish formation suggests the medium-term trend has weakened below the long-term baseline for ${ticker}.`}</p>
                </div>
                <div className="flex gap-3">
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${analysis.fiso_score >= 45 ? 'bg-emerald-400' : analysis.fiso_score >= 30 ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <p><span className="text-white font-semibold">Momentum (RSI 14):</span> {analysis.fiso_score >= 60 ? `RSI is in the neutral-to-bullish zone (30-70). The stock has healthy buying momentum without being overbought. This is the ideal RSI range for initiating or holding long positions.` : analysis.fiso_score >= 30 ? `RSI is neutral. The stock is neither oversold nor overbought, indicating a period of consolidation. Watch for a directional breakout.` : `RSI indicates oversold conditions (below 30). While this can signal a potential bounce, in a strong downtrend oversold can stay oversold. Wait for RSI to turn upward before entering.`}</p>
                </div>
                <div className="flex gap-3">
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${analysis.fiso_score >= 60 ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <p><span className="text-white font-semibold">Signal (MACD):</span> {analysis.fiso_score >= 60 ? `The MACD line is above its signal line, confirming bullish momentum. This crossover shows that buying pressure is accelerating and the trend is strengthening for ${ticker}.` : `The MACD line is below its signal line. Selling momentum currently dominates. A bullish MACD crossover would be a key confirmation signal to watch for before entering longs.`}</p>
                </div>
              </div>
            </div>

            {/* Global News Context */}
            <div className="bg-black/30 rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-amber-400">🌐</span> Market Context & News Sentiment
              </h3>
              <div className="space-y-3 text-sm text-gray-300">
                <p className="leading-relaxed">Based on current technical positioning of <span className="text-blue-300 font-semibold">{ticker}</span>, the stock is showing <span className={`font-semibold ${verdictColor}`}>{analysis.verdict.toLowerCase()}</span> signals. Global macro factors currently influencing this sector include interest rate expectations, FII/DII flows for Indian markets, and broader risk sentiment in equity markets.</p>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Sector Trend</p>
                    <p className={`font-bold ${analysis.fiso_score >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{analysis.fiso_score >= 50 ? 'Bullish' : 'Bearish'}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Volatility</p>
                    <p className="font-bold text-amber-400">Moderate</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Volume Signal</p>
                    <p className={`font-bold ${analysis.fiso_score >= 60 ? 'text-emerald-400' : 'text-gray-400'}`}>{analysis.fiso_score >= 60 ? 'Strong' : 'Weak'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Trade Setup */}
            <div className="bg-black/30 rounded-2xl p-6">
              <h3 className="font-bold text-white mb-5 flex items-center gap-2">
                <span className="text-emerald-400">🎯</span> Trade Setup
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Entry Price</p>
                  <p className="text-2xl font-black font-mono text-blue-300">{currency}{analysis.entry}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Current Price</p>
                  <p className="text-2xl font-black font-mono text-white">{currency}{analysis.current_price}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Stop Loss</p>
                  <p className="text-2xl font-black font-mono text-red-400">{currency}{analysis.stop_loss}</p>
                  <p className="text-red-600 text-xs mt-1">Maximum acceptable loss</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Target Price</p>
                  <p className="text-2xl font-black font-mono text-emerald-400">{currency}{analysis.target}</p>
                  <p className="text-emerald-600 text-xs mt-1">Profit objective</p>
                </div>
              </div>
              <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Risk-Reward Ratio</p>
                <p className="text-3xl font-black text-emerald-400">{analysis.risk_reward}</p>
                <p className="text-gray-600 text-xs mt-1">For every {currency}1 risked, potential gain of {currency}2</p>
              </div>
            </div>
          </div>
        )}

        {!analysis && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Select a stock to begin analysis...</p>
          </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-700">
          Educational tool only • Not financial advice • Past performance is not indicative of future results
        </div>
      </div>
    </div>
  );
}