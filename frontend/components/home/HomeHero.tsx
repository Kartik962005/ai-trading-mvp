import Link from "next/link";
import { Badge, Button, Card, Stat } from "@/components/ui";

export type HomeMarket = "INDIA" | "US";

export interface HomeHeroProps {
  activeMarket: HomeMarket;
  visibleCount: number;
  totalCount: number;
  signedIn: boolean;
  onOpenDailySignals: () => void;
}

export function HomeHero({
  activeMarket,
  visibleCount,
  totalCount,
  signedIn,
  onOpenDailySignals,
}: HomeHeroProps) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_380px] lg:items-stretch">
      <Card
        padding="lg"
        className="relative overflow-hidden border-white/70 bg-white/82 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-300"
        />
        <div
          aria-hidden
          className="absolute -right-24 -top-28 h-64 w-64 rounded-full bg-cyan-200/35 blur-3xl"
        />
        <div className="relative max-w-4xl">
          <Badge tone="accent" pill>
            Live Market Intelligence
          </Badge>
          <h2 className="mt-5 max-w-4xl font-['Space_Grotesk'] text-4xl font-black leading-[0.98] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Scan live markets. Open the setup worth your attention.
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
            Bullseye ranks stocks with FISO confidence, live quotes, and AI-backed context so the homepage
            stays fast to scan while each stock detail view stays deep enough for research.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/ask-ai"
              className="force-light-text inline-flex h-12 items-center justify-center rounded-2xl border border-cyan-400/60 bg-gradient-to-r from-cyan-600 to-emerald-500 px-5 font-['Space_Grotesk'] text-xs font-black uppercase tracking-[0.18em] shadow-[0_12px_32px_rgba(6,182,212,0.28)] transition hover:from-cyan-500 hover:to-emerald-400"
            >
              Ask AI
            </Link>
            <Link
              href="/screens"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 font-['Space_Grotesk'] text-xs font-black uppercase tracking-[0.18em] text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.08)] transition hover:border-cyan-300 hover:text-cyan-700"
            >
              Open Screener
            </Link>
            <Button variant="secondary" size="lg" onClick={onOpenDailySignals} className="border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700">
              {signedIn ? "Daily Alerts" : "Sign In for Alerts"}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        padding="lg"
        className="grid content-between gap-5 border-white/70 bg-white/82 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl"
      >
        <div>
          <div className="font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
            Session Snapshot
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Current homepage scope is tuned for quick market triage before opening a single-stock dashboard.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card padding="sm" className="border-slate-200 bg-slate-50">
            <Stat label="Market" value={activeMarket} hint={activeMarket === "INDIA" ? "NSE / BSE" : "NASDAQ / NYSE"} />
          </Card>
          <Card padding="sm" className="border-slate-200 bg-slate-50">
            <Stat label="Visible" value={visibleCount} hint={`of ${totalCount} tracked`} />
          </Card>
          <Card padding="sm" className="border-slate-200 bg-slate-50">
            <Stat label="Signals" value="FISO" hint="verdict + confidence" tone="accent" />
          </Card>
          <Card padding="sm" className="border-slate-200 bg-slate-50">
            <Stat label="Flow" value="Live" hint="quotes + preview" tone="positive" />
          </Card>
        </div>
      </Card>
    </section>
  );
}
