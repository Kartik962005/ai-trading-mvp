"use client";

// Scroll3D — real 3D depth motion for CONTENT (not just the background).
// Each wrapped block sits in its own perspective space: it flies in from depth
// while tilted back, straightens and locks flat as it reaches the middle of the
// viewport, then recedes and tilts away as it leaves. Scrolling up reverses it.
//
// Driven straight from scroll position and applied by mutating the node's style
// inside a rAF — no React re-render per frame, so it stays smooth.

import { useEffect, useRef, type ReactNode } from "react";

export interface Scroll3DProps {
  children: ReactNode;
  className?: string;
  /** 0.5 = subtle, 1 = default, 1.6 = dramatic. */
  intensity?: number;
  /** Depth travel in px. */
  depth?: number;
}

export function Scroll3D({ children, className, intensity = 1, depth = 300 }: Scroll3DProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    // Respect reduced motion: leave the content flat and fully visible.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const apply = () => {
      frame = 0;
      const rect = outer.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const centre = rect.top + rect.height / 2;

      // -1 => still below the fold, 0 => dead centre, +1 => moved above.
      let p = (centre - viewport / 2) / (viewport * 0.8);
      p = Math.max(-1.25, Math.min(1.25, p));
      const a = Math.abs(p);

      const rotateX = -p * 11 * intensity;
      const translateZ = -a * depth * intensity;
      const translateY = p * 26 * intensity;
      const scale = 1 - a * 0.05 * intensity;
      // Stay fully readable near the centre; only fade once nearly off-screen.
      const opacity = a <= 0.4 ? 1 : Math.max(0, 1 - (a - 0.4) * 1.5);

      inner.style.transform =
        `translate3d(0, ${translateY.toFixed(1)}px, ${translateZ.toFixed(1)}px) ` +
        `rotateX(${rotateX.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      inner.style.opacity = opacity.toFixed(3);
    };

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
  }, [intensity, depth]);

  return (
    <div ref={outerRef} className={className} style={{ perspective: "1250px", perspectiveOrigin: "50% 45%" }}>
      <div
        ref={innerRef}
        style={{ transformStyle: "preserve-3d", willChange: "transform, opacity" }}
      >
        {children}
      </div>
    </div>
  );
}

export default Scroll3D;
