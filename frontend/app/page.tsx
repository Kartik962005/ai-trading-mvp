'use client';
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(`https://ai-trading-backend-jhcl.onrender.com${url}`).then(res => res.json());
export default function Home() {
  const [ticker, setTicker] = useState('RELIANCE.NS');
  const [input, setInput] = useState('RELIANCE.NS');
  const chartRef = useRef<HTMLDivElement>(null);

  const { data: quote } = useSWR(`/api/v1/quote/${ticker}`, fetcher, { refreshInterval: 30000 });
  const { data: chartData } = useSWR(`/api/v1/chart/${ticker}`, fetcher);
  const { data: analysis } = useSWR(`/api/v1/analyze/${ticker}`, fetcher);

  useEffect(() => {
    if (!chartData || !chartRef.current) return;
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

  const handleSearch = () => setTicker(input.toUpperCase());

  const verdictColor =
    analysis?.verdict?.includes('Buy')
      ? 'text-green-400'
      : analysis?.verdict === 'Hold'
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">

      <h1 className="text-4xl font-bold mb-2">AI Trading Assistant</h1>
      <p className="text-gray-400 mb-8">Search any stock and get instant technical analysis</p>

      <div className="flex gap-4 mb-8">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="bg-gray-900 border border-gray-700 px-4 py-3 rounded-lg text-lg w-72 outline-none focus:border-blue-500"
          placeholder="e.g. RELIANCE.NS or AAPL"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-semibold transition-colors"
        >
          Analyze
        </button>
      </div>

      {quote && (
        <div className="mb-6">
          <span className="text-3xl font-bold">{ticker} </span>
          <span className="text-3xl text-green-400 font-mono">
            ₹{quote.price ?? 'N/A'}
          </span>
          {quote.change_percent != null && (
            <span className={`text-xl ml-3 ${quote.change_percent > 0 ? 'text-green-400' : 'text-red-400'}`}>
              ({quote.change_percent.toFixed(2)}%)
            </span>
          )}
        </div>
      )}

      {!chartData && (
        <div className="w-full h-[400px] bg-gray-900 rounded-xl flex items-center justify-center mb-8">
          <p className="text-gray-500 text-lg">Loading chart...</p>
        </div>
      )}
      <div ref={chartRef} className="w-full mb-8 rounded-xl overflow-hidden" />

      {analysis && !analysis.error && (
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
          <p className="text-right text-sm text-gray-400 mb-6">
            {analysis.fiso_score} / 90
          </p>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Price</span>
              <span className="font-mono">₹{analysis.current_price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Entry</span>
              <span className="font-mono text-blue-300">₹{analysis.entry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stop Loss</span>
              <span className="font-mono text-red-400">₹{analysis.stop_loss}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Target</span>
              <span className="font-mono text-green-400">₹{analysis.target}</span>
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
          <p className="text-gray-500">Calculating analysis...</p>
        </div>
      )}

      <div className="mt-12 text-xs text-gray-600">
        Educational tool only • Not financial advice • Past performance is not indicative of future results
      </div>

    </div>
  );
}