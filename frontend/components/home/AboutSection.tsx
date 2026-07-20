"use client";

// About / philosophy — the trust block. Bullseye's differentiator is that it is
// willing to say "sit out", so that honesty is the story we lead with here,
// right before the footer.

import { SectionShell } from "./SectionShell";

const PRINCIPLES = [
  {
    title: "Win rate is not profit",
    body: "A high hit-rate with tiny wins and rare huge losses is a trap. Every backtest here separates the two and says so plainly.",
  },
  {
    title: "Some days you sit out",
    body: "Markets are weak sometimes. On those days Bullseye returns a low-conviction day rather than manufacturing a trade to fill the screen.",
  },
  {
    title: "Every number is checkable",
    body: "Signals come from real OHLCV and a model you can retrain — not a black box. When data is missing, it says missing.",
  },
];

export function AboutSection() {
  return (
    <SectionShell
      eyebrow="Why Bullseye"
      title={
        <>
          Built to be <em className="italic text-accent">honest</em> before it is impressive.
        </>
      }
      description="Most tools are optimised to look confident. This one is optimised to be right about how uncertain it is."
      compact
    >
      <div className="grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-3">
        {PRINCIPLES.map((principle) => (
          <div key={principle.title} className="bg-ink-soft p-7">
            <h3 className="font-display text-[22px] leading-snug text-paper">{principle.title}</h3>
            <p className="mt-3 font-body text-[14px] leading-7 text-paper-muted">{principle.body}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export default AboutSection;
