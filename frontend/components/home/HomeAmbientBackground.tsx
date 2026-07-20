"use client";

// Full-viewport immersive background for the homepage: the Candlestick Canyon
// 3D scene (three.js) that the camera flies through as the page scrolls.
// A dark base always renders underneath, so reduced-motion users and any
// device without WebGL still get a clean, consistent dark page.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CandlestickCanyon = dynamic(() => import("@/components/three/CandlestickCanyon"), {
  ssr: false,
});

export function HomeAmbientBackground() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const check = () => {
      // Runs on every screen size — only reduced-motion opts out.
      const supportsWebGL = (() => {
        try {
          const canvas = document.createElement("canvas");
          return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
        } catch {
          return false;
        }
      })();
      setEnabled(!media.matches && supportsWebGL);
    };
    check();
    media.addEventListener?.("change", check);
    return () => media.removeEventListener?.("change", check);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Dark base — always present so the page never flashes light. */}
      <div className="absolute inset-0 bg-[#03060e]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 520px at 50% 42%, rgba(59,169,255,0.10), transparent 62%)",
        }}
      />

      {enabled && <CandlestickCanyon />}

      {/* Vignette so foreground content stays readable over the scene. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,6,14,0.72) 0%, rgba(3,6,14,0.28) 26%, rgba(3,6,14,0.45) 70%, rgba(3,6,14,0.86) 100%)",
        }}
      />
    </div>
  );
}

export default HomeAmbientBackground;
