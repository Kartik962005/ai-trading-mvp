import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

export type NavLinkVariant = "default" | "primary" | "dark";

const BASE =
  "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-3 font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.16em] outline-none transition sm:h-12 sm:px-5 sm:text-xs sm:tracking-[0.2em] focus-visible:ring-2 focus-visible:ring-cyan-300/60";

const VARIANT: Record<NavLinkVariant, string> = {
  // Ghost link — for secondary nav items.
  default: "border border-white/10 bg-white/5 text-slate-200 hover:border-cyan-300/60 hover:text-white",
  // Primary gradient CTA — e.g. "Ask AI".
  primary:
    "border border-cyan-400/60 bg-gradient-to-r from-cyan-600 to-emerald-500 text-white shadow-[0_12px_32px_rgba(6,182,212,0.28)] hover:from-cyan-500 hover:to-emerald-400",
  // Solid dark — e.g. "Screener".
  dark: "border border-white/10 bg-slate-950 text-white hover:border-cyan-500 hover:bg-cyan-600",
};

export interface NavLinkProps {
  href: string;
  children: ReactNode;
  variant?: NavLinkVariant;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Header navigation link/CTA, styled per the design system. */
export function NavLink({ href, children, variant = "default", active = false, onClick, className }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(BASE, VARIANT[variant], active && "border-cyan-300 text-white", className)}
    >
      {children}
    </Link>
  );
}
