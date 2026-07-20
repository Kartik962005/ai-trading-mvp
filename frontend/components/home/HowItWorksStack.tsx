"use client";

// How it works — four cards that stack as you scroll the PAGE using CSS
// position: sticky (no scroll hijack, works on mobile). Restyled into the
// redesign language: editorial serif, black cards, gold step numerals.

import { SectionShell } from "./SectionShell";

const STEPS = [
  {
    step: "01",
    title: "Scan the market",
    body: "Live NSE and BSE quotes with an honest verdict on a short list of featured stocks — the page stays fast, verdicts fill in as you scroll.",
  },
  {
    step: "02",
    title: "Screen in English or SQL",
    body: "Type “profitable smallcaps with low debt and RSI under 40”, or write raw SQL. The AI turns it into a real query across 2,000+ stocks and shows you the SQL it ran.",
  },
  {
    step: "03",
    title: "Analyse with conviction",
    body: "Every setup ships an entry, a target and a stop-loss with a day-level conviction score. Weak day? It tells you to sit out instead of forcing a trade.",
  },
  {
    step: "04",
    title: "Get signals by email",
    body: "Ranked picks delivered after close on your schedule, reasoning included — and nothing at all on days with no signal worth sending.",
  },
];

export function HowItWorksStack() {
  return (
    <SectionShell
      eyebrow="How it works"
      title={
        <>
          From market noise to <em className="italic text-accent">one clear setup</em>.
        </>
      }
      description="Four steps, in the order you actually use them."
    >
      {/* Sticky stack: each card pins slightly lower than the last as the page
          scrolls, gathering into a deck. */}
      <div className="relative pb-[26vh]">
        {STEPS.map((step, i) => (
          <div key={step.step} className="sticky" style={{ top: `${104 + i * 20}px`, zIndex: i + 1 }}>
            <div className="mb-6 overflow-hidden rounded-3xl border border-hairline bg-ink-soft/95 p-8 shadow-[0_28px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-10">
              <div className="flex items-baseline gap-5">
                <span className="font-numeric text-[13px] tracking-[0.3em] text-accent">{step.step}</span>
                <span aria-hidden className="h-px flex-1 bg-hairline" />
              </div>
              <h3 className="mt-6 max-w-[22ch] font-display text-[clamp(1.7rem,3.2vw,2.6rem)] leading-[1.06] text-paper">
                {step.title}
              </h3>
              <p className="mt-4 max-w-[62ch] font-body text-[15px] leading-8 text-paper-muted">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export default HowItWorksStack;
