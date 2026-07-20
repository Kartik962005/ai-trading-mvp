"use client";

// Shared section wrapper for the redesigned homepage: gold rule + eyebrow,
// editorial serif heading, optional description and right-aligned actions.
// Every section below the hero uses this so the rhythm stays identical.

import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export interface SectionShellProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Tighter vertical rhythm for lower-priority sections (news, about). */
  compact?: boolean;
}

export function SectionShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  compact = false,
}: SectionShellProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-[1180px] px-6 sm:px-8",
        compact ? "py-16 sm:py-20" : "py-24 sm:py-32",
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[52ch]">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-8 bg-accent/60" />
            <span className="font-body text-[11px] font-medium uppercase tracking-[0.28em] text-accent">
              {eyebrow}
            </span>
          </div>
          <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.3rem)] font-normal leading-[1.04] text-paper">
            {title}
          </h2>
          {description ? (
            <p className="mt-4 font-body text-[15px] leading-7 text-paper-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-12">{children}</div> : null}
    </section>
  );
}

export default SectionShell;
