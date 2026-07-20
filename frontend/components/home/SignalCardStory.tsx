"use client";

// ─── THE SIGNAL CARD ────────────────────────────────────────────────────────
// The homepage's scroll storyline. One gold-edged signal card performs across
// five beats as you scroll a tall section:
//
//   1. idle      — a single card turns slowly in space
//   2. flip      — it flips to its back: entry / target / stop / confidence
//   3. fan       — it multiplies into a deck (we scan the whole market)
//   4. cull      — the deck blows apart, cards spin off and dim
//   5. the one   — a single card slams back to centre and ignites gold
//
// Built with CSS 3D on real DOM cards so the text stays crisp and selectable.
// The stage is position:fixed and toggled by scroll range rather than sticky,
// because an `overflow-x: hidden` ancestor breaks position:sticky.

import { useEffect, useRef } from "react";

const DECK = 12;

const BEATS = [
  { at: 0.04, kicker: "01 — Scan", title: "Every listed name, every session." },
  { at: 0.24, kicker: "02 — Read", title: "Entry, target, stop. On the back of the card." },
  { at: 0.46, kicker: "03 — Screen", title: "Two thousand candidates, ranked." },
  { at: 0.66, kicker: "04 — Cut", title: "Almost all of them fail the bar." },
  { at: 0.87, kicker: "05 — The one", title: "One setup worth your attention." },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Normalised progress through a sub-range of the scroll. */
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
/** Deterministic spread so the deck looks scattered but never changes. */
const spread = (i: number) => {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export function SignalCardStory() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const beatRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const travel = Math.max(1, rect.height - vh);
      const p = clamp01(-rect.top / travel);

      // Only show the fixed stage while this section owns the viewport.
      const inView = rect.top <= 0 && rect.bottom >= vh * 0.9;
      stage.style.opacity = inView ? "1" : "0";
      stage.style.visibility = inView ? "visible" : "hidden";

      const flip = seg(p, 0.16, 0.34);
      const fan = seg(p, 0.36, 0.56);
      const cull = seg(p, 0.60, 0.80);
      const finale = seg(p, 0.82, 1);

      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const isHero = i === 0;
        const r = spread(i);

        if (isHero) {
          // Flips to the back, then flips home and ignites for the finale.
          const rotY = flip * 180 * (1 - finale);
          const scale = 1 + finale * 0.22 - cull * 0.04;
          const lift = -finale * 10;
          el.style.transform =
            `translate3d(0px, ${lift.toFixed(1)}px, ${(finale * 90).toFixed(1)}px) ` +
            `rotateY(${rotY.toFixed(2)}deg) rotateZ(0deg) scale(${scale.toFixed(3)})`;
          el.style.opacity = "1";
          el.style.zIndex = "40";
          el.style.filter = finale > 0
            ? `drop-shadow(0 0 ${(26 * finale).toFixed(0)}px rgba(245,196,81,${(0.55 * finale).toFixed(2)}))`
            : "none";
          return;
        }

        // Deck cards: fan out, then get culled away.
        const dir = i % 2 === 0 ? 1 : -1;
        const fanX = dir * (30 + r * 190) * fan;
        const fanY = (r - 0.5) * 120 * fan;
        const fanZ = -i * 26 * fan;
        const fanRot = dir * (4 + r * 16) * fan;

        const cullX = dir * (520 + r * 620) * cull;
        const cullY = (r - 0.5) * 520 * cull;
        const cullRot = dir * 65 * cull;

        const x = fanX + cullX;
        const y = fanY + cullY;
        const z = fanZ - cull * 420;
        const rot = fanRot + cullRot;
        const opacity = clamp01(fan * (1 - cull * 1.25));

        el.style.transform =
          `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) ` +
          `rotateY(${(fanRot * 0.8).toFixed(2)}deg) rotateZ(${rot.toFixed(2)}deg) scale(${(1 - fan * 0.06).toFixed(3)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = String(10 + i);
      });

      // Beat captions cross-fade as their moment arrives.
      beatRefs.current.forEach((el, i) => {
        if (!el) return;
        const start = BEATS[i].at;
        const end = i + 1 < BEATS.length ? BEATS[i + 1].at : 1.06;
        const mid = (start + end) / 2;
        const half = Math.max(0.001, (end - start) / 2);
        const distance = Math.abs(p - mid) / half;
        const o = clamp01(1.35 - distance);
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translateY(${((1 - o) * 22).toFixed(1)}px)`;
      });
    };

    if (reduced) {
      // Reduced motion: show the hero card flat and the final caption only.
      stage.style.opacity = "1";
      stage.style.visibility = "visible";
      return;
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative" style={{ height: "460vh" }}>
      {/* Fixed stage — stays centred while the section owns the viewport. */}
      <div
        ref={stageRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center transition-opacity duration-300"
        style={{ perspective: "1500px", perspectiveOrigin: "50% 50%" }}
      >
        <div className="relative" style={{ transformStyle: "preserve-3d" }}>
          {Array.from({ length: DECK }).map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ transformStyle: "preserve-3d", willChange: "transform, opacity" }}
            >
              <SignalCard hero={i === 0} index={i} />
            </div>
          ))}
        </div>
      </div>

      {/* Beat captions, stacked in the middle of the stage. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[12vh] z-20 flex justify-center px-6">
        <div className="relative h-32 w-full max-w-[720px] text-center">
          {BEATS.map((beat, i) => (
            <div
              key={beat.kicker}
              ref={(el) => {
                beatRefs.current[i] = el;
              }}
              className="absolute inset-x-0 top-0"
              style={{ opacity: 0, willChange: "transform, opacity" }}
            >
              <div className="font-numeric text-[11px] uppercase tracking-[0.3em] text-accent">
                {beat.kicker}
              </div>
              <h3 className="mt-4 font-display text-[clamp(1.6rem,3.4vw,2.7rem)] leading-tight text-paper">
                {beat.title}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A single gold-edged signal card (front + back faces). */
function SignalCard({ hero, index }: { hero: boolean; index: number }) {
  const tickers = ["RELIANCE", "INFY", "TCS", "HDFCBANK", "ITC", "SBIN", "WIPRO", "MARUTI", "CIPLA", "NTPC", "AXISBANK", "LT"];
  const ticker = tickers[index % tickers.length];

  return (
    <div
      className="relative"
      style={{
        width: "clamp(258px, 25vw, 372px)",
        aspectRatio: "1.58 / 1",
        transformStyle: "preserve-3d",
      }}
    >
      {/* FRONT */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[20px] border border-accent/45 p-6"
        style={{
          backfaceVisibility: "hidden",
          background:
            "linear-gradient(145deg, rgba(24,26,22,0.96) 0%, rgba(9,11,10,0.98) 52%, rgba(18,20,17,0.96) 100%)",
          boxShadow: "0 26px 70px rgba(0,0,0,0.7), inset 0 1px 0 rgba(245,196,81,0.22)",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-[6px] w-[6px] rounded-full bg-accent" />
            <span className="font-display text-lg leading-none text-paper">
              Bulls<span className="text-accent">eye</span>
            </span>
          </div>
          <span className="font-numeric text-[10px] uppercase tracking-[0.2em] text-primary">Buy</span>
        </div>

        <div className="mt-7 font-numeric text-[26px] leading-none tracking-tight text-paper">{ticker}</div>
        <div className="mt-2 font-body text-[11px] uppercase tracking-[0.22em] text-paper-muted">NSE · Signal</div>

        <div className="absolute inset-x-6 bottom-6 flex items-end justify-between">
          <div className="h-[3px] w-24 rounded-full bg-accent/70" />
          <span className="font-numeric text-[11px] text-paper-muted">{hero ? "FISO 78" : "—"}</span>
        </div>
      </div>

      {/* BACK */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[20px] border border-accent/45 p-6"
        style={{
          backfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
          background:
            "linear-gradient(145deg, rgba(10,14,12,0.98) 0%, rgba(6,8,7,0.99) 60%, rgba(12,16,13,0.98) 100%)",
          boxShadow: "0 26px 70px rgba(0,0,0,0.7), inset 0 1px 0 rgba(245,196,81,0.18)",
        }}
      >
        <div className="font-body text-[10px] uppercase tracking-[0.26em] text-accent">The setup</div>
        <dl className="mt-5 space-y-3">
          {[
            ["Entry", "1,341 – 1,356"],
            ["Target", "1,393"],
            ["Stop loss", "1,324"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-b border-hairline pb-2">
              <dt className="font-body text-[11px] uppercase tracking-[0.16em] text-paper-muted">{k}</dt>
              <dd className="font-numeric text-[13px] text-paper">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="absolute inset-x-6 bottom-5 flex items-center gap-3">
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[78%] rounded-full bg-primary" />
          </div>
          <span className="font-numeric text-[11px] text-primary">78</span>
        </div>
      </div>
    </div>
  );
}

export default SignalCardStory;
