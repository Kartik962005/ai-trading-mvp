import Link from "next/link";
import { cn } from "@/components/ui/cn";

export interface FooterProps {
  className?: string;
}

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/screens", label: "Screener" },
  { href: "/ask-ai", label: "Ask AI" },
  { href: "/alerts", label: "Alerts" },
];

/** Shared site footer with brand, nav, and the research-use disclaimer. */
export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn("border-t border-white/10 bg-slate-950", className)}>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-md">
          <div className="font-['Space_Grotesk'] text-lg font-black uppercase tracking-[0.18em]">
            <span className="text-white">BULLS</span>
            <span className="text-cyan-400">EYE</span>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-slate-400 font-['JetBrains_Mono']">
            AI-powered stock analysis and trading research. Signals are model-generated analysis for
            research use only — returns are not guaranteed and past performance does not guarantee
            future results.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Footer">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-['Space_Grotesk'] text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 transition hover:text-cyan-300"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 text-[10px] uppercase tracking-[0.18em] text-slate-600 font-['Space_Grotesk'] sm:px-6">
          © {new Date().getFullYear()} Bullseye · For research and education only
        </div>
      </div>
    </footer>
  );
}
