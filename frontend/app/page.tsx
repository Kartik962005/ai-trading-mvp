'use client';
import { useState } from 'react';

// --- MOCK DATA ---
const INDICES = [
  { name: 'S&P 500', value: '5,304.72', change: '+1.2%', up: true },
  { name: 'NASDAQ', value: '16,920.58', change: '+0.9%', up: true },
  { name: 'NIFTY 50', value: '23,005.30', change: '+0.8%', up: true },
  { name: 'SENSEX', value: '75,410.39', change: '+0.5%', up: true },
  { name: 'BANK NIFTY', value: '48,972.10', change: '+1.1%', up: true },
  { name: 'GIFT NIFTY', value: '23,110.00', change: '+0.7%', up: true },
];

const WATCHLIST = [
  { name: 'Reliance Ind.', ticker: 'RELIANCE', value: '₹2,950.40', change: '+2.4%', up: true },
  { name: 'Apple Inc.', ticker: 'AAPL', value: '$189.98', change: '+1.8%', up: true },
  { name: 'Bitcoin', ticker: 'BTC', value: '$68,420.00', change: '+4.2%', up: true },
  { name: 'Tata Motors', ticker: 'TATAMOTORS', value: '₹960.25', change: '-0.5%', up: false },
  { name: 'HDFC Bank', ticker: 'HDFCBANK', value: '₹1,520.10', change: '+1.1%', up: true },
];

const NEWS = [
  "Fed holds rates steady, signals potential cuts in late 2026.",
  "Tech sector rallies as AI infrastructure spending surges.",
  "Reliance announces major expansion into green energy sector.",
  "Bitcoin breaks resistance, eyeing new all-time highs.",
];

export default function Home() {
  const [search, setSearch] = useState('');

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&family=Inter:wght@400;500;700&display=swap');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      
      {/* 1. BACKGROUND ENGINE */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-black">
        <video autoPlay loop muted playsInline className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto object-cover -translate-x-1/2 -translate-y-1/2 opacity-30 mix-blend-screen">
          <source src="/background.mp4" type="video/mp4" />
        </video>
        {/* Subtle radial gradient overlay to focus the center */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1a0b00]/60 via-[#0a0500]/90 to-black/100" />
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f59e0b0a_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b0a_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* 2. MAIN APP CONTAINER (Fluid width, prevents horizontal scrolling on mobile) */}
      <div className="relative z-10 min-h-screen flex flex-col text-gray-200 font-['Inter'] selection:bg-amber-500/30 w-full overflow-x-hidden">
        
        {/* --- NAVBAR --- */}
        <nav className="w-full px-4 sm:px-8 py-4 border-b border-amber-500/10 bg-[#0a0500]/50 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
            
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-300 to-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                <span className="font-black text-black font-['Orbitron']">S</span>
              </div>
              <span className="font-black text-xl sm:text-2xl tracking-widest uppercase text-white font-['Orbitron'] hidden sm:block">
                Signal<span className="text-amber-500">X</span>
              </span>
            </div>

            {/* Global Search */}
            <div className="flex-1 max-w-xl relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500/50 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              <input 
                type="text" 
                placeholder="Search SIGNALX..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1a0f05]/80 border border-amber-500/20 rounded-full py-2.5 pl-10 pr-4 text-sm font-medium text-amber-50 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-amber-500/30"
              />
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-4 hidden sm:flex">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-200/60 hover:text-amber-400 cursor-pointer transition-colors">Dashboard</span>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-200/60 hover:text-amber-400 cursor-pointer transition-colors">Markets</span>
              <div className="w-10 h-10 rounded-full border-2 border-amber-500/30 bg-[#1a0f05] flex items-center justify-center text-amber-400 font-bold font-['Rajdhani'] cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                AS
              </div>
            </div>
          </div>
        </nav>

        {/* --- MAIN CONTENT --- */}
        <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 flex flex-col gap-8">
          
          {/* Hero Headline */}
          <div className="max-w-4xl py-4 sm:py-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.1]">
              <span className="text-white block mb-1">Track your goals.</span>
              <span className="text-gray-400 block mb-1">Streamline your processes.</span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-amber-400 to-orange-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)] block">
                Power your decisions.
              </span>
            </h1>
          </div>

          {/* BENTO GRID SYSTEM */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
            
            {/* LEFT COLUMN (Wide Content) */}
            <div className="lg:col-span-8 flex flex-col gap-6 w-full min-w-0">
              
              {/* Bento Box: Market Today */}
              <div className="bg-[#0a0500]/70 backdrop-blur-xl border border-amber-500/15 rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex flex-col min-w-0">
                <h2 className="text-sm font-bold text-amber-500/70 tracking-widest uppercase mb-4 font-['Rajdhani']">Market Today</h2>
                
                {/* Horizontal Scroll Container for mobile */}
                <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2 -mx-2 px-2">
                  {INDICES.map((idx, i) => (
                    <div key={i} className="flex-shrink-0 bg-[#1a0f05]/50 border border-amber-500/10 rounded-2xl p-4 min-w-[140px] hover:bg-amber-900/10 transition-colors">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{idx.name}</span>
                      <div className="text-lg font-black text-white font-['Orbitron'] mb-1">{idx.value}</div>
                      <div className={`text-xs font-bold ${idx.up ? 'text-amber-400' : 'text-rose-400'}`}>
                        {idx.up ? '▲' : '▼'} {idx.change}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bento Box: Performance Chart (Fluid Height) */}
              <div className="bg-[#0a0500]/70 backdrop-blur-xl border border-amber-500/15 rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex-1 flex flex-col min-h-[400px]">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-sm font-bold text-amber-500/70 tracking-widest uppercase mb-1 font-['Rajdhani']">Portfolio Performance</h2>
                    <div className="text-4xl sm:text-5xl font-black text-white tracking-tighter">
                      $124,508<span className="text-2xl text-gray-500">.42</span>
                    </div>
                    <div className="text-sm font-bold text-amber-400 mt-2">▲ +$3,420.50 (2.8%) Today</div>
                  </div>
                  <div className="hidden sm:flex gap-2">
                    {['1D', '1W', '1M', '1Y', 'ALL'].map(t => (
                      <button key={t} className={`px-3 py-1 rounded-lg text-xs font-bold ${t === '1M' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-gray-500 hover:bg-white/5'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Abstract Line Chart SVG Placeholder to fit the aesthetic perfectly */}
                <div className="flex-1 w-full relative mt-4">
                  <div className="absolute inset-0 bg-gradient-to-t from-amber-500/5 to-transparent rounded-b-xl"></div>
                  <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full overflow-visible drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                    <path d="M0,250 C100,220 200,280 300,200 C400,120 500,180 600,100 C700,20 800,150 900,50 L1000,80" fill="none" stroke="url(#amber-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    <defs>
                      <linearGradient id="amber-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#fcd34d" />
                        <stop offset="50%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (Sidebar Content) */}
            <div className="lg:col-span-4 flex flex-col gap-6 w-full">
              
              {/* Bento Box: Watchlist */}
              <div className="bg-[#0a0500]/70 backdrop-blur-xl border border-amber-500/15 rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                <h2 className="text-sm font-bold text-amber-500/70 tracking-widest uppercase mb-4 font-['Rajdhani']">Watchlist</h2>
                <div className="flex flex-col gap-3">
                  {WATCHLIST.map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-xl hover:bg-amber-900/10 transition-colors border border-transparent hover:border-amber-500/10 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1a0f05] border border-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-300">
                          {item.ticker.slice(0,2)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-200">{item.name}</div>
                          <div className="text-[10px] font-mono text-gray-500">{item.ticker}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-white">{item.value}</div>
                        <div className={`text-[10px] font-bold ${item.up ? 'text-amber-400' : 'text-rose-400'}`}>
                          {item.change}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bento Box: Portfolio Distribution */}
              <div className="bg-[#0a0500]/70 backdrop-blur-xl border border-amber-500/15 rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-amber-500/70 tracking-widest uppercase mb-2 font-['Rajdhani']">Distribution</h2>
                  <div className="flex flex-col gap-2 mt-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Equities (65%)</div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300"><span className="w-2 h-2 rounded-full bg-orange-600"></span> Crypto (25%)</div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-300"><span className="w-2 h-2 rounded-full bg-[#1f2937]"></span> Cash (10%)</div>
                  </div>
                </div>
                {/* CSS Pie Chart */}
                <div className="relative w-28 h-28 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.2)]" 
                     style={{ background: 'conic-gradient(#f59e0b 0% 65%, #ea580c 65% 90%, #1f2937 90% 100%)' }}>
                  <div className="absolute inset-2 bg-[#0a0500] rounded-full flex items-center justify-center">
                     <span className="font-['Orbitron'] font-bold text-amber-500 text-xs">A.I.</span>
                  </div>
                </div>
              </div>

              {/* Bento Box: Market News */}
              <div className="bg-[#0a0500]/70 backdrop-blur-xl border border-amber-500/15 rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex-1">
                <h2 className="text-sm font-bold text-amber-500/70 tracking-widest uppercase mb-4 font-['Rajdhani']">Terminal Feed</h2>
                <div className="flex flex-col gap-4">
                  {NEWS.map((headline, i) => (
                    <div key={i} className="border-l-2 border-amber-500/30 pl-3">
                      <p className="text-xs font-medium text-gray-300 hover:text-amber-300 cursor-pointer transition-colors leading-relaxed line-clamp-2">
                        {headline}
                      </p>
                      <span className="text-[9px] font-mono text-gray-600 uppercase mt-1 block">12 Mins Ago</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    </>
  );
}