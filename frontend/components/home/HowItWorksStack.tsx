"use client";

// "How Bullseye works" — four dark cards that stack as you scroll the PAGE using
// CSS position: sticky. No lenis / scoped scroller, so it never hijacks scroll
// (you don't need to hover a card to scroll) and it works on mobile too.

const STEPS = [
  {
    step: "01",
    title: "Scan the market",
    body: "Live NSE & BSE quotes with FISO verdicts on a handful of featured stocks — the homepage stays fast, verdicts stream in as you scroll.",
    accent: "#22d3ee",
  },
  {
    step: "02",
    title: "Screen in English or SQL",
    body: "Type “profitable smallcaps with low debt and RSI under 40” — or raw SQL. The AI turns it into a real query over 2,000+ stocks and shows you the SQL it ran.",
    accent: "#34d399",
  },
  {
    step: "03",
    title: "Analyze with honest conviction",
    body: "Every setup ships entry, target and stop-loss with a day-level conviction label. Weak day? Bullseye says “sit out” instead of forcing a trade.",
    accent: "#38bdf8",
  },
  {
    step: "04",
    title: "Get signals by email",
    body: "Daily post-close signal emails on your schedule — ranked picks, reasoning included, no spam on no-signal days.",
    accent: "#a78bfa",
  },
];

export function HowItWorksStack() {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:rounded-3xl sm:p-6">
      <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
        How it works
      </span>
      <h2 className="mt-3 font-['Space_Grotesk'] text-2xl font-black tracking-tight text-white sm:text-3xl">
        From market noise to one clear setup
      </h2>

      {/* Sticky-stack: each card pins a little lower than the last as the page
          scrolls, so they gather into a deck. Extra bottom padding gives scroll
          room for the effect. */}
      <div className="relative mt-6 pb-[30vh]">
        {STEPS.map((step, i) => (
          <div
            key={step.step}
            className="sticky"
            style={{ top: `${96 + i * 22}px`, zIndex: i + 1 }}
          >
            <div
              className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/85 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8"
              style={{ boxShadow: `0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 ${step.accent}33` }}
            >
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: `linear-gradient(90deg, ${step.accent}, transparent)` }}
              />
              <span
                className="font-['JetBrains_Mono'] text-xs font-black tracking-[0.3em]"
                style={{ color: step.accent }}
              >
                {step.step}
              </span>
              <h3 className="mt-3 font-['Space_Grotesk'] text-2xl font-black tracking-tight text-white sm:text-3xl">
                {step.title}
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{step.body}</p>
              <div className="mt-6 h-1 w-16 rounded-full" style={{ backgroundColor: step.accent }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorksStack;
