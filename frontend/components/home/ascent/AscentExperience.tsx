"use client";

// Orchestrates the "Ascent" cinematic homepage hero:
//  • A tall scroll container (5 acts of copy) that is fully SSR'd and readable
//    with WebGL dead or JS off.
//  • A fixed, transparent WebGL layer (portaled to <body> so no transformed
//    ancestor can break `position:fixed`) holding the AscentScene.
//  • A GSAP ScrollTrigger scrub that writes scroll progress into a ref and wakes
//    the demand render loop via invalidate() — native scroll is never hijacked.
// Low-end devices / reduced-motion get a static CSS medallion and the same copy.

import Link from "next/link";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ScrollApi } from "./AscentScene";

const AscentScene = dynamic(() => import("./AscentScene"), { ssr: false });

interface AscentExperienceProps {
  signedIn: boolean;
  onOpenDailySignals: () => void;
}

function Act({
  align,
  eyebrow,
  children,
}: {
  align: "left" | "right" | "top" | "bottom";
  eyebrow: string;
  children: ReactNode;
}) {
  const position =
    align === "left"
      ? "items-center justify-start text-left"
      : align === "right"
        ? "items-center justify-end text-right"
        : align === "top"
          ? "items-start justify-center pt-[16vh] text-center"
          : "items-end justify-center pb-[16vh] text-center";
  return (
    <section className={`relative flex min-h-[100svh] w-full ${position}`}>
      <div className="max-w-[40ch] rounded-[28px] px-2 py-6" style={{ background: "radial-gradient(120% 120% at 50% 50%, rgba(0,0,0,0.55), transparent 72%)" }}>
        <div className={`flex items-center gap-3 ${align === "right" ? "justify-end" : align === "left" ? "justify-start" : "justify-center"}`}>
          <span className="h-px w-9 bg-accent/60" />
          <span className="font-body text-[11px] font-medium uppercase tracking-[0.28em] text-accent">{eyebrow}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

export function AscentExperience({ signedIn, onOpenDailySignals }: AscentExperienceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const apiRef = useRef<ScrollApi | null>(null);

  const [mounted, setMounted] = useState(false);
  const [sceneEnabled, setSceneEnabled] = useState(false);

  useEffect(() => setMounted(true), []);

  // Capability + reduced-motion gate for the WebGL layer.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => {
      const webgl = (() => {
        try {
          const c = document.createElement("canvas");
          return !!(c.getContext("webgl2") || c.getContext("webgl"));
        } catch {
          return false;
        }
      })();
      const nav = navigator as Navigator & { deviceMemory?: number };
      const enoughMemory = (nav.deviceMemory ?? 4) >= 4;
      const enoughCores = (navigator.hardwareConcurrency ?? 4) >= 4;
      setSceneEnabled(!media.matches && webgl && enoughMemory && enoughCores);
    };
    // Run the (cheap) check directly. It already runs post-paint inside an
    // effect; deferring via requestIdleCallback risks never firing in a
    // backgrounded/undisplayed tab.
    decide();
    media.addEventListener?.("change", decide);
    return () => media.removeEventListener?.("change", decide);
  }, []);

  // GSAP ScrollTrigger scrub → progress ref → invalidate(). Fade the fixed scene
  // out as the reader scrolls past the finale into the live product below.
  useEffect(() => {
    if (!sceneEnabled || !rootRef.current) return;
    let killed = false;
    const triggers: Array<{ kill: () => void }> = [];
    (async () => {
      const gsapMod = await import("gsap");
      const stMod = await import("gsap/ScrollTrigger");
      const gsap = (gsapMod as unknown as { default?: typeof import("gsap")["gsap"]; gsap?: typeof import("gsap")["gsap"] }).gsap ?? gsapMod.default;
      const ScrollTrigger = (stMod as unknown as { ScrollTrigger?: unknown; default?: unknown }).ScrollTrigger ?? stMod.default;
      if (killed || !rootRef.current) return;
      gsap.registerPlugin(ScrollTrigger as never);
      const ST = ScrollTrigger as unknown as { create: (v: Record<string, unknown>) => { kill: () => void } };
      triggers.push(
        ST.create({
          trigger: rootRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          onUpdate: (self: { progress: number }) => {
            progress.current = self.progress;
            apiRef.current?.invalidate();
          },
        }),
      );
      triggers.push(
        ST.create({
          trigger: rootRef.current,
          start: "bottom bottom",
          end: "+=70%",
          scrub: true,
          onUpdate: (self: { progress: number }) => {
            if (layerRef.current) layerRef.current.style.opacity = String(1 - self.progress);
          },
        }),
      );
    })();
    return () => {
      killed = true;
      triggers.forEach((t) => t.kill());
    };
  }, [sceneEnabled]);

  const fixedLayer = (
    <div ref={layerRef} aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-black" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(820px 560px at 50% 42%, rgba(52,211,153,0.10), transparent 64%), radial-gradient(680px 480px at 74% 26%, rgba(245,196,81,0.08), transparent 60%)",
        }}
      />
      {sceneEnabled ? (
        <AscentScene progress={progress} apiRef={apiRef} />
      ) : (
        // Static fallback medallion — no WebGL required.
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent/50 bg-[radial-gradient(circle_at_50%_40%,rgba(14,22,19,0.9),#04070a)] shadow-[0_0_80px_rgba(52,211,153,0.18)]">
          <div className="absolute inset-6 rounded-full border border-primary/40" />
          <div className="absolute inset-14 rounded-full border border-accent/50" />
          <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent font-display text-2xl text-black">
            ₹
          </div>
        </div>
      )}
      {/* Bottom scrim so the copy never fights the scene. */}
      <div className="absolute inset-x-0 bottom-0 h-[45vh]" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.55))" }} />
    </div>
  );

  return (
    <>
      {mounted && createPortal(fixedLayer, document.body)}

      {/* Acts — SSR'd copy scrolling above the fixed scene. */}
      <div ref={rootRef} className="relative z-10">
        <Act align="left" eyebrow="Live market intelligence">
          <h1 className="mt-7 font-display text-[clamp(2.8rem,7.5vw,6rem)] font-normal leading-[0.94] text-paper">
            One honest
            <br />
            <em className="italic text-accent">verdict.</em>
          </h1>
          <p className="mt-7 font-body text-[15px] leading-8 text-paper-muted">
            Bullseye reads the entire market and hands you one thing that matters — a call with
            entry, target, stop, and an honest conviction score.
          </p>
        </Act>

        <Act align="top" eyebrow="The whole tape">
          <h2 className="mt-7 font-display text-[clamp(2.4rem,6vw,4.6rem)] font-normal leading-[1.0] text-paper">
            The whole market,
            <br />
            <em className="italic text-accent">at once.</em>
          </h2>
          <p className="mt-6 font-body text-[15px] leading-8 text-paper-muted">
            Two thousand tickers, every session — indices, sectors, the noise and the signal, all
            in view before a single decision is made.
          </p>
        </Act>

        <Act align="right" eyebrow="The read">
          <h2 className="mt-7 font-display text-[clamp(2.4rem,6vw,4.6rem)] font-normal leading-[1.0] text-paper">
            We fly the tape
            <br />
            so <em className="italic text-accent">you don&apos;t.</em>
          </h2>
          <p className="mt-6 font-body text-[15px] leading-8 text-paper-muted">
            The engine scores momentum, quality, risk and setup across the market — then throws away
            everything that doesn&apos;t clear the gates. Most days, most of it.
          </p>
        </Act>

        <Act align="bottom" eyebrow="The verdict">
          <h2 className="mt-7 font-display text-[clamp(2.4rem,6vw,4.6rem)] font-normal leading-[1.0] text-paper">
            Then it commits
            <br />
            to <em className="italic text-accent">one.</em>
          </h2>
          <p className="mt-6 font-body text-[15px] leading-8 text-paper-muted">
            A single verdict, stamped: buy or hold, entry and target, a stop, and the conviction
            behind it. On a weak day, it tells you to sit out.
          </p>
        </Act>

        <Act align="right" eyebrow="Your move">
          <h2 className="mt-7 font-display text-[clamp(3rem,7vw,5.6rem)] font-normal leading-[0.96] text-paper">
            See your
            <br />
            <em className="italic text-accent">number.</em>
          </h2>
          <p className="mt-6 font-body text-[15px] leading-8 text-paper-muted">
            Open the screener for today&apos;s ranked short list, or ask anything in plain English.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/screens"
              className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 font-body text-[13px] font-semibold tracking-wide text-black transition duration-300 hover:bg-accent-dim"
            >
              Open Screener
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
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
        </Act>
      </div>
    </>
  );
}

export default AscentExperience;
