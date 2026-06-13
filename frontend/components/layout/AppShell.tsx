import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { AppHeader } from "./AppHeader";
import type { AppHeaderProps } from "./AppHeader";
import { Footer } from "./Footer";

export interface AppShellProps {
  children: ReactNode;
  /** Props forwarded to the header (brand / center / actions). */
  header?: AppHeaderProps;
  /** Render the shared footer (default true). */
  footer?: boolean;
  /** Add the signature cyan radial-glow background. */
  glow?: boolean;
  /** Constrain main content width (default matches the wide app layout). */
  mainClassName?: string;
  className?: string;
}

/**
 * Full-page dark shell: radial-glow canvas + sticky AppHeader + main + Footer.
 * Use for standard interior pages (screener, ask-ai, alerts). The homepage keeps
 * its own video background and composes AppHeader directly.
 */
export function AppShell({
  children,
  header,
  footer = true,
  glow = true,
  mainClassName = "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6",
  className,
}: AppShellProps) {
  return (
    <div className={cn("relative flex min-h-screen flex-col bg-slate-950 text-white", className)}>
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              "radial-gradient(60% 40% at 80% -5%, rgba(34,211,238,0.10), transparent 60%), radial-gradient(50% 40% at 0% 0%, rgba(52,211,153,0.06), transparent 55%)",
          }}
        />
      )}
      <div className="relative z-10 flex min-h-screen flex-col">
        <AppHeader {...header} />
        <main className={cn("flex-1", mainClassName)}>{children}</main>
        {footer && <Footer />}
      </div>
    </div>
  );
}
