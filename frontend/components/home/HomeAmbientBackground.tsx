"use client";

// Full-viewport immersive background for the homepage: a dark base + soft
// vignette always render (so mobile / reduced-motion get a clean dark theme),
// and the React Bits Lightfall WebGL "light rain" streams on top on desktop.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Lightfall = dynamic(() => import("@/components/reactbits/Lightfall"), { ssr: false });

export function HomeAmbientBackground() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const check = () => setEnabled(window.innerWidth >= 768 && !media.matches);
    check();
    window.addEventListener("resize", check);
    media.addEventListener?.("change", check);
    return () => {
      window.removeEventListener("resize", check);
      media.removeEventListener?.("change", check);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Dark base — guarantees a consistent dark theme even before/without WebGL. */}
      <div className="absolute inset-0 bg-[#04070f]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 620px at 50% -8%, rgba(34,211,238,0.12), transparent 60%), radial-gradient(900px 600px at 85% 20%, rgba(82,39,255,0.10), transparent 55%)",
        }}
      />
      {enabled && (
        <div className="absolute inset-0 opacity-90">
          <Lightfall
            colors={["#A6C8FF", "#5227FF", "#FF9FFC", "#22d3ee"]}
            backgroundColor="#0A29FF"
            speed={0.7}
            streakCount={7}
            streakWidth={1}
            streakLength={1}
            glow={1}
            density={0.9}
            twinkle={1}
            zoom={2.2}
            backgroundGlow={0.9}
            opacity={1}
            mouseInteraction
            mouseStrength={1}
            mouseRadius={0.6}
          />
        </div>
      )}
      {/* Fade the streaks toward the bottom so lower content stays legible. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, transparent 0%, rgba(4,7,15,0.35) 60%, rgba(4,7,15,0.72) 100%)" }}
      />
    </div>
  );
}

export default HomeAmbientBackground;
