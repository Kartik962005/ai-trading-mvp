"use client";

// Redesigned hero: full-viewport editorial statement over the 3D market globe.
// Nothing competes with the headline — the live index ticker is pinned to the
// bottom edge as ambient proof the product is live ("Live Market Intelligence"
// lives here rather than as its own section).

import Link from "next/link";
import type { ReactNode } from "react";

export interface HeroSectionProps {
  signedIn: boolean;
  onOpenDailySignals: () => void;
  /** Live index ticker, rendered as the hero's bottom band. */
  ticker?: ReactNode;
}

export function HeroSection({ signedIn, onOpenDailySignals, ticker }: HeroSectionProps) {
  return (
    // Full-bleed: escape the main container's max-width + padding so the hero
    // truly fills the viewport edge to edge.
    <section className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] flex min-h-[100svh] w-screen flex-col justify-center">
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-28 pt-24 sm:px-8">
        {/* Eyebrow */}
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-accent/60" />
          <span className="font-body text-[11px] font-medium uppercase tracking-[0.28em] text-accent">
            Live Market Intelligence
          </span>
        </div>

        {/* Editorial headline */}
        <h1 className="mt-8 max-w-[15ch] font-display text-[clamp(2.9rem,8.4vw,7rem)] font-normal leading-[0.92] text-paper">
          Scan live markets.
          <br />
          Open the <em className="italic text-accent">one setup</em> worth your attention.
        </h1>

        <p className="mt-9 max-w-[52ch] font-body text-[15px] leading-8 text-paper-muted sm:text-base">
          Bullseye reads the whole market, then hands you a short list with entry, target and
          stop-loss — and an honest conviction score. On a weak day it tells you to sit out.
        </p>

        {/* Actions */}
        <div className="mt-11 flex flex-wrap items-center gap-3">
          <Link
            href="/screens"
            className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 font-body text-[13px] font-semibold tracking-wide text-black transition duration-300 hover:bg-accent-dim"
          >
            Open Screener
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </Link>
          <Link
            href="/ask-ai"
            className="inline-flex h-13 items-center justify-center rounded-full border border-hairline bg-glass px-7 py-4 font-body text-[13px] font-semibold tracking-wide text-paper backdrop-blur-md transition duration-300 hover:border-primary/50 hover:bg-glass-strong"
          >
            Ask AI
          </Link>
          <button
            type="button"
            onClick={onOpenDailySignals}
            className="inline-flex h-13 items-center justify-center px-3 py-4 font-body text-[13px] font-medium text-paper-muted underline-offset-4 transition hover:text-paper hover:underline"
          >
            {signedIn ? "Daily alerts" : "Get daily signals"}
          </button>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 hidden justify-center sm:flex">
        <span className="font-body text-[10px] uppercase tracking-[0.3em] text-paper-muted/60">
          Scroll
        </span>
      </div>

      {/* Live ticker band pinned to the hero's bottom edge */}
      {ticker ? (
        <div className="absolute inset-x-0 bottom-0 border-t border-hairline bg-black/40 backdrop-blur-md">
          {ticker}
        </div>
      ) : null}
    </section>
  );
}

export default HeroSection;
