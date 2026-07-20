"use client";

// Live Scan — the featured stock grid. The old "Session Snapshot" card is
// folded into this section's header as a slim stat rail: it is metadata about
// the scan, not a section of its own (giving it a card was the original
// design's mistake).

import type { ReactNode } from "react";
import { SectionShell } from "./SectionShell";

export interface LiveScanSectionProps {
  visibleCount: number;
  totalCount: number;
  columnCount: number;
  children: ReactNode;
}

export function LiveScanSection({ visibleCount, totalCount, columnCount, children }: LiveScanSectionProps) {
  const stats: Array<{ label: string; value: string; tone: string }> = [
    { label: "Market", value: "INDIA", tone: "text-paper" },
    { label: "Featured", value: String(visibleCount), tone: "text-paper" },
    { label: "Tracked", value: String(totalCount), tone: "text-paper" },
    { label: "Signals", value: "FISO", tone: "text-primary" },
    { label: "Flow", value: "Live", tone: "text-accent" },
  ];

  return (
    <SectionShell
      eyebrow="Live Scan"
      title={
        <>
          A short list, not a<br className="hidden sm:block" /> screen full of noise.
        </>
      }
      description="Each card carries a live quote, an honest verdict and a confidence bar. Open one for the full read."
    >
      {/* Session Snapshot, merged in as a stat rail */}
      <div className="mb-10 flex flex-wrap gap-x-12 gap-y-5 border-y border-hairline py-5">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="font-body text-[10px] font-medium uppercase tracking-[0.22em] text-paper-muted">
              {stat.label}
            </div>
            <div className={`mt-1.5 font-numeric text-lg leading-none ${stat.tone}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
    </SectionShell>
  );
}

export default LiveScanSection;
