'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`https://ai-trading-backend-jhcl.onrender.com${url}`).then(res => res.json());

// Stock database with name, symbol, exchange, currency
const STOCKS = [
  // Indian Stocks - NSE
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
  { name: 'ONGC', symbol: 'ONGC', exchange: 'NSE', ticker: 'ONGC.NS', currency: '₹' },
  { name: 'NTPC', symbol: 'NTPC', exchange: 'NSE', ticker: 'NTPC.NS', currency: '₹' },
  { name: 'Tata Motors', symbol: 'TATAMOTORS', exchange: 'NSE', ticker: 'TATAMOTORS.NS', currency: '₹' },
  { name: 'Sun Pharma', symbol: 'SUNPHARMA', exchange: 'NSE', ticker: 'SUNPHARMA.NS', currency: '₹' },
  { name: 'Tech Mahindra', symbol: 'TECHM', exchange: 'NSE', ticker: 'TECHM.NS', currency: '₹' },
  { name: 'HCL Technologies', symbol: 'HCLTECH', exchange: 'NSE', ticker: 'HCLTECH.NS', currency: '₹' },
  { name: 'Power Grid', symbol: 'POWERGRID', exchange: 'NSE', ticker: 'POWERGRID.NS', currency: '₹' },
  { name: 'Larsen & Toubro', symbol: 'LT', exchange: 'NSE', ticker: 'LT.NS', currency: '₹' },
  { name: 'Asian Paints', symbol: 'ASIANPAINT', exchange: 'NSE', ticker: 'ASIANPAINT.NS', currency: '₹' },
  { name: 'Nestle India', symbol: 'NESTLEIND', exchange: 'NSE', ticker: 'NESTLEIND.NS', currency: '₹' },
  // Indian Stocks - BSE
  { name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'BSE', ticker: '500325.BO', currency: '₹' },
  { name: 'Tata Consultancy Services', symbol: 'TCS', exchange: 'BSE', ticker: '532540.BO', currency: '₹' },
  { name: 'Infosys', symbol: 'INFY', exchange: 'BSE', ticker: '500209.BO', currency: '₹' },
  { name: 'HDFC Bank', symbol: 'HDFCBANK', exchange: 'BSE', ticker: '500180.BO', currency: '₹' },
  { name: 'Wipro', symbol: 'WIPRO', exchange: 'BSE', ticker: '507685.BO', currency: '₹' },
  { name: 'State Bank of India', symbol: 'SBIN', exchange: 'BSE', ticker: '500112.BO', currency: '₹' },
  // US Stocks
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
  { name: 'JPMorgan Chase', symbol: 'JPM', exchange: 'NYSE', ticker: 'JPM', currency: '$' },
  { name: 'Berkshire Hathaway', symbol: 'BRK-B', exchange: 'NYSE', ticker: 'BRK-B', currency: '$' },
];

export default function Home() {
  const [ticker, setTicker] = useState('TCS.NS');
  const [currency, setCurrency] = useState('₹');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<typeof STOCKS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: quote } = useSWR(`/api/v1/quote/${ticker}`, fetcher, { refreshInterval: 30000 });
  const { data: chartData } = useSWR(`/api/v1/chart/${ticker}`, fetcher);
  const { data: analysis } = useSWR(`/api/v1/analyze/${ticker}`, fetcher);

  // Filter suggestions as user types
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
    ).slice(0, 8); // max 8 results
    setSuggestions(filtered);
    setShowSuggestions(true);
  }, [input]);

  // Chart
  useEffect(() => {
    if (!chartData || !chartRef.current) return;
    if (!Array.isArray(chartData) || chartData.length === 0) return;
    chartRef.current.innerHTML = '';

    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth || 800,
        height: 400,
        layout: {
          background: { color: '#111827' },
          textColor: '#9ca3af',
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries);
      const formattedData = chartData
        .filter((d: any) => d.date && d.open && d.high && d.low && d.close)
        .map((d: any) => ({
          time: d.date?.toString().slice(0, 10),
          open: parseFloat(d.open),
          high: parseFloat(d.high),
          low: parseFloat(d.low),
          close: parseFloat(d.close),
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
  };

  const verdictColor =
    analysis?.verdict?.includes('Buy') ? 'text-green-400' :
    analysis?.verdict === 'Hold' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">

      <h1 className="text-4xl font-bold mb-2">AI Trading Assistant</h1>
      <p className="text-gray-400 mb-8">Search any stock by name or symbol</p>

      {/* Search Bar */}
      <div className="relative w-full max-w-lg mb-8">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => input.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          className="w-full bg-gray-900 border border-gray-700 px-4 py-3 rounded-lg text-lg outline-none focus:border-blue-500"
          placeholder="Search: Infosys, Apple, TCS, NVDA..."
        />

        {/* Dropdown suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 shadow-xl">
            {suggestions.map((stock, i) => (
              <div
                key={i}
                onMouseDown={() => selectStock(stock)}
                className="flex justify-between items-center px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-0"
              >
                <div>
                  <span className="font-semibold">{stock.name}</span>
                  <span className="text-gray-400 text-sm ml-2">{stock.symbol}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded font-mono ${
                  stock.exchange === 'NSE' ? 'bg-blue-900 text-blue-300' :
                  stock.exchange === 'BSE' ? 'bg-orange-900 text-orange-300' :
                  'bg-green-900 text-green-300'
                }`}>
                  {stock.exchange}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Currently viewing */}
      <p className="text-gray-500 text-sm mb-4">
        Viewing: <span className="text-blue-400 font-mono">{ticker}</span>
      </p>

      {/* Live Price */}
      {quote && quote.price && (
        <div className="mb-6">
          <span className="text-3xl font-bold">{ticker} </span>
          <span className="text-3xl text-green-400 font-mono">
            {currency}{quote.price}
          </span>
          {quote.change_percent != null && (
            <span className={`text-xl ml-3 ${quote.change_percent > 0 ? 'text-green-400' : 'text-red-400'}`}>
              ({quote.change_percent.toFixed(2)}%)
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      {!chartData && (
        <div className="w-full h-[400px] bg-gray-900 rounded-xl flex items-center justify-center mb-8">
          <p className="text-gray-500 text-lg">Select a stock to view chart</p>
        </div>
      )}
      <div ref={chartRef} className="w-full mb-8 rounded-xl overflow-hidden" />

      {/* Analysis Card */}
      {analysis && !analysis.error && analysis.verdict && (
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md">
          <h2 className="text-2xl font-bold mb-4">Intelligent Assistant</h2>
          <div className={`text-5xl font-bold mb-4 ${verdictColor}`}>
            {analysis.verdict}
          </div>
          <p className="text-gray-400 mb-1">FISO Score</p>
          <div className="w-full bg-gray-800 rounded-full h-3 mb-1">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all"
              style={{ width: `${(analysis.fiso_score / 90) * 100}%` }}
            />
          </div>
          <p className="text-right text-sm text-gray-400 mb-6">{analysis.fiso_score} / 90</p>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Price</span>
              <span className="font-mono">{currency}{analysis.current_price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Entry</span>
              <span className="font-mono text-blue-300">{currency}{analysis.entry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stop Loss</span>
              <span className="font-mono text-red-400">{currency}{analysis.stop_loss}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Target</span>
              <span className="font-mono text-green-400">{currency}{analysis.target}</span>
            </div>
            <div className="flex justify-between border-t border-gray-700 pt-3">
              <span className="text-gray-400">Risk-Reward</span>
              <span className="font-mono text-green-400 font-bold">{analysis.risk_reward}</span>
            </div>
          </div>
        </div>
      )}

      {!analysis && (
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md">
          <p className="text-gray-500">Select a stock above to see analysis...</p>
        </div>
      )}

      <div className="mt-12 text-xs text-gray-600">
        Educational tool only • Not financial advice • Past performance is not indicative of future results
      </div>
    </div>
  );
}