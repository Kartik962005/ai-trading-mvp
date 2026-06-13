import type { ReactNode } from "react";
import { Badge, Card, SectionHeading, cn } from "@/components/ui";
import type { HomeMarket } from "./HomeHero";

export interface MarketScanSectionProps {
  activeMarket: HomeMarket;
  visibleCount: number;
  totalCount: number;
  page: number;
  pageCount: number;
  columnCount: number;
  children: ReactNode;
  onPageChange: (page: number) => void;
}

export function MarketScanSection({
  activeMarket,
  visibleCount,
  totalCount,
  page,
  pageCount,
  columnCount,
  children,
  onPageChange,
}: MarketScanSectionProps) {
  return (
    <Card
      padding="lg"
      className="overflow-hidden border-white/70 bg-white/82 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl"
    >
      <SectionHeading
        eyebrow="Live Scan"
        title="Market-scan stock grid"
        description={`Showing ${visibleCount} of ${totalCount} tracked stocks with live quote context, verdict dots, and confidence bars.`}
        actions={<Badge tone="accent" pill>{activeMarket}</Badge>}
        className="border-b border-slate-200 pb-4"
      />
      <div
        className="mt-5 grid gap-4 sm:gap-5"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
      <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row">
        <div className="font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Page {page} / {pageCount}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((nextPage) => (
            <button
              key={nextPage}
              type="button"
              onClick={() => onPageChange(nextPage)}
              className={cn(
                "h-9 min-w-9 rounded-xl border px-3 font-['JetBrains_Mono'] text-xs font-black transition-all",
                page === nextPage
                  ? "border-cyan-300 bg-cyan-400 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                  : "border-slate-200 bg-white text-slate-500 hover:border-cyan-300 hover:text-cyan-700",
              )}
              aria-label={`Show stock page ${nextPage}`}
            >
              {nextPage}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
