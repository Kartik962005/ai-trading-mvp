import Link from "next/link";
import { Card } from "@/components/ui";

export interface HomeFeatureSectionProps {
  onOpenDailySignals: () => void;
}

const FEATURES = [
  [
    "Signal Engine",
    "FISO scoring converts trend, momentum, risk, and sentiment inputs into one readable market verdict.",
  ],
  [
    "Technical Workspace",
    "Indicator panels sit below the candle chart so momentum, volume, volatility, and trend studies can be compared without leaving the page.",
  ],
  [
    "Research Flow",
    "Paginated cards keep the homepage fast to scan, then detailed dashboards open with price, chart, targets, stop loss, and strategy context.",
  ],
];

export function HomeFeatureSection({ onOpenDailySignals }: HomeFeatureSectionProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-300/25 bg-slate-950 p-5 shadow-[0_28px_90px_rgba(8,47,73,0.28)] sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
        <Card padding="lg" className="flex min-h-[260px] flex-col justify-between border-white/10 bg-white/[0.06]">
          <div>
            <div className="font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
              About Bullseye
            </div>
            <h2 className="mt-4 max-w-3xl font-['Space_Grotesk'] text-2xl font-black leading-tight text-slate-50 sm:text-4xl">
              A focused market cockpit for scanning, comparing, and validating stock setups.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 font-['JetBrains_Mono']">
              Bullseye brings chart action, FISO confidence, technical studies, strategy ranking, live quotes,
              and deeper stock context into one research flow.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/ask-ai"
              className="force-light-text inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-400/60 bg-gradient-to-r from-cyan-600 to-emerald-500 px-4 font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.18em] transition hover:from-cyan-500 hover:to-emerald-400"
            >
              Ask AI
            </Link>
            <Link
              href="/screens"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.18em] text-slate-200 transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
            >
              Screener
            </Link>
            <button
              type="button"
              onClick={onOpenDailySignals}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.18em] text-slate-200 transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
            >
              Daily Signals
            </button>
          </div>
        </Card>

        <div className="grid gap-3">
          {FEATURES.map(([title, body]) => (
            <Card key={title} padding="md" className="border-white/10 bg-white/[0.045] transition-colors hover:border-cyan-300/30 hover:bg-white/[0.07]">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.75)]" />
                <div>
                  <div className="font-['Space_Grotesk'] text-sm font-black uppercase tracking-[0.18em] text-slate-50">
                    {title}
                  </div>
                  <p className="mt-2 text-xs leading-6 text-slate-300 font-['JetBrains_Mono']">{body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
