import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Brand } from "./Brand";

export interface AppHeaderProps {
  /** Brand lockup. Defaults to a Brand linking to "/". */
  brand?: ReactNode;
  /** Center region — e.g. a search field. Grows to fill space. */
  center?: ReactNode;
  /** Right region — nav links, account menu, etc. */
  actions?: ReactNode;
  /** Container max width utility (default matches the app's wide layout). */
  maxWidthClassName?: string;
  className?: string;
}

/**
 * Sticky, dark glass app header. Layout-only: pass brand / center / actions.
 * Stateful pieces (search, account menu) live in the page and are passed in,
 * so this component owns no state.
 */
export function AppHeader({
  brand,
  center,
  actions,
  maxWidthClassName = "max-w-[1600px]",
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-wrap items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4 lg:flex-nowrap lg:gap-5",
          maxWidthClassName,
        )}
      >
        <div className="min-w-0 shrink-0">{brand ?? <Brand href="/" />}</div>
        {center != null && (
          <div className="relative order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">{center}</div>
        )}
        {actions != null && <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">{actions}</div>}
      </div>
    </header>
  );
}
