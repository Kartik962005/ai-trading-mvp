import { Badge, Button, Card, EmptyState } from "@/components/ui";

export type SignalDeliveryMode = "today" | "next_day";

export type DailySignalPreview = {
  symbol: string;
  direction: "BUY" | "SELL";
  entry_low: number;
  entry_high: number;
  target_price: number;
  stop_loss: number;
  confidence: number;
  risk_reward: number;
  explanation_json?: { reasons?: string[] };
};

export interface DailySignalPreviewCardProps {
  signedIn: boolean;
  userEmail?: string | null;
  signals: DailySignalPreview[];
  isSaving: boolean;
  message?: string;
  error?: string;
  onOpenSettings: () => void;
  onSendNow: (deliveryMode: SignalDeliveryMode) => void;
}

export function DailySignalPreviewCard({
  signedIn,
  userEmail,
  signals,
  isSaving,
  message,
  error,
  onOpenSettings,
  onSendNow,
}: DailySignalPreviewCardProps) {
  const destination = signedIn ? userEmail || "signed-in account" : "your signed-in account";

  return (
    <Card padding="lg" className="border-cyan-300/25 bg-slate-950 text-slate-100 shadow-[0_28px_90px_rgba(8,47,73,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="accent" pill>
            Daily Signal Email
          </Badge>
          <h3 className="mt-4 font-['Space_Grotesk'] text-2xl font-black leading-tight text-slate-50">
            Next-session stocks, packaged like an email preview.
          </h3>
          <p className="mt-3 text-[12px] leading-6 text-slate-300 font-['JetBrains_Mono']">
            Signals go to {destination}. Fewer are sent when the market is weak and few names clear the quality bar.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <button
          type="button"
          onClick={() => (signedIn ? onSendNow("today") : onOpenSettings())}
          disabled={isSaving}
          className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-4 text-left transition hover:border-amber-300/45 hover:bg-amber-400/14 disabled:opacity-60"
        >
          <span className="block font-['Space_Grotesk'] text-sm font-black uppercase tracking-[0.16em] text-slate-50">
            Today&apos;s Stocks
          </span>
          <span className="mt-2 block text-[11px] leading-5 text-slate-300 font-['JetBrains_Mono']">
            Same-day intraday email using the latest available data.
          </span>
        </button>
        <button
          type="button"
          onClick={() => (signedIn ? onSendNow("next_day") : onOpenSettings())}
          disabled={isSaving}
          className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-4 text-left transition hover:border-emerald-300/45 hover:bg-emerald-400/14 disabled:opacity-60"
        >
          <span className="block font-['Space_Grotesk'] text-sm font-black uppercase tracking-[0.16em] text-slate-50">
            Next-Day Stocks
          </span>
          <span className="mt-2 block text-[11px] leading-5 text-slate-300 font-['JetBrains_Mono']">
            Ranked 10-stock email for the next trading day.
          </span>
        </button>
      </div>

      {(error || message) && (
        <div className="mt-4 space-y-2">
          {error && (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs text-red-200 font-['JetBrains_Mono']">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100 font-['JetBrains_Mono']">
              {message}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {signals.length > 0 ? (
          signals.slice(0, 4).map((signal) => (
            <div key={signal.symbol} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-['Space_Grotesk'] text-sm font-black text-slate-50">{signal.symbol}</div>
                <div
                  className={`font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.18em] ${
                    signal.direction === "BUY" ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {signal.direction}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-300 font-['JetBrains_Mono']">
                Entry {signal.entry_low.toFixed(2)}-{signal.entry_high.toFixed(2)} | Target{" "}
                {signal.target_price.toFixed(2)} | Stop Loss {signal.stop_loss.toFixed(2)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-['JetBrains_Mono']">
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-black uppercase tracking-[0.14em] text-cyan-300">
                  Confidence {Math.round((signal.confidence ?? 0) * 100)}%
                </span>
                {typeof signal.risk_reward === "number" && (
                  <span className="text-slate-400">R:R {signal.risk_reward.toFixed(2)}</span>
                )}
              </div>
              <div className="mt-2 text-[10px] text-slate-400 font-['JetBrains_Mono']">
                {(signal.explanation_json?.reasons ?? []).slice(0, 2).join(" | ") || "Model-ranked technical setup"}
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No preview loaded"
            description="The latest next-trading-day signal preview appears after the prediction engine runs for the signed-in account."
            className="border-white/10 bg-white/[0.02] py-7"
          />
        )}
      </div>

      <div className="mt-5">
        <Button variant="primary" size="lg" block onClick={onOpenSettings} disabled={isSaving}>
          {signedIn ? "Configure Daily Alerts" : "Sign In to Configure"}
        </Button>
      </div>
    </Card>
  );
}
