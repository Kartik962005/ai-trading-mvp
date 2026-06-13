import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

export interface BrandProps {
  /** Render as a Link to this href. */
  href?: string;
  /** Or render as a button with this click handler (e.g. homepage goHome). */
  onClick?: () => void;
  tagline?: string;
  showTagline?: boolean;
  showWordmark?: boolean;
  className?: string;
}

/**
 * The Bullseye brand lockup: gradient "BE" mark + BULLSEYE wordmark.
 * Dark-theme correct (white wordmark, cyan accent). Pass `href` OR `onClick`.
 */
export function Brand({
  href,
  onClick,
  tagline = "AI-Powered Market Intelligence",
  showTagline = true,
  showWordmark = true,
  className,
}: BrandProps) {
  const inner: ReactNode = (
    <span className="flex items-center gap-2 sm:gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-100 to-emerald-100 sm:h-11 sm:w-11">
        <span className="font-['Space_Grotesk'] text-sm font-black text-cyan-700 sm:text-base">BE</span>
      </span>
      {showWordmark && (
        <span className="leading-tight">
          <span className="block font-['Space_Grotesk'] text-xl font-black uppercase tracking-[0.16em] sm:text-2xl sm:tracking-[0.18em]">
            <span className="text-white">BULLS</span>
            <span className="text-cyan-400">EYE</span>
          </span>
          {showTagline && tagline && (
            <span className="hidden font-['Space_Grotesk'] text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:block">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );

  const cls = cn("group inline-flex min-w-0 shrink-0 items-center outline-none", className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
