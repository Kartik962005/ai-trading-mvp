import { cn } from "@/components/ui";
import type { HomeMarket } from "./HomeHero";

export interface MarketSwitcherProps {
  activeMarket: HomeMarket;
  onMarketChange: (market: HomeMarket) => void;
}

const MARKETS: Array<{ id: HomeMarket; title: string; subtitle: string }> = [
  { id: "INDIA", title: "India", subtitle: "NSE / BSE" },
  { id: "US", title: "US", subtitle: "NASDAQ / NYSE" },
];

export function MarketSwitcher({ activeMarket, onMarketChange }: MarketSwitcherProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {MARKETS.map((market) => {
        const active = market.id === activeMarket;
        return (
          <button
            key={market.id}
            type="button"
            onClick={() => onMarketChange(market.id)}
            className={cn(
              "relative overflow-hidden rounded-2xl border p-4 text-left backdrop-blur-xl transition-all duration-300 sm:rounded-3xl sm:p-6",
              active
                ? "border-cyan-300 bg-cyan-50 shadow-[0_18px_45px_rgba(8,145,178,0.14)] ring-1 ring-cyan-200"
                : "border-white/70 bg-white/78 hover:border-cyan-200 hover:bg-white",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
                market.id === "INDIA" ? "from-cyan-400 to-emerald-400" : "from-cyan-400 to-slate-400",
                active ? "opacity-100" : "opacity-35",
              )}
            />
            <span className="font-['Space_Grotesk'] text-base font-black uppercase tracking-tight text-slate-950 sm:text-2xl">
              {market.title}
            </span>
            <span className="mt-2 block font-['JetBrains_Mono'] text-[9px] uppercase tracking-widest text-slate-500 sm:text-[10px]">
              {market.subtitle}
            </span>
          </button>
        );
      })}
    </div>
  );
}
