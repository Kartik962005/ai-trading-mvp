"use client";

// Reusable scroll-reveal primitive (framer-motion). Wrap any block to have it
// fade/slide in the first time it scrolls into view — the backbone of the
// homepage "storyline" feel. Respects prefers-reduced-motion (renders static),
// and only animates ONCE so it never re-triggers or fights scroll.

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger delay in seconds. */
  delay?: number;
  /** Vertical travel in px (positive = rises up into place). */
  y?: number;
  /** Animation duration in seconds. */
  duration?: number;
};

export function Reveal({ children, className, delay = 0, y = 28, duration = 0.6 }: RevealProps) {
  const reduce = useReducedMotion();

  // Reduced motion: render plain, always visible — never hide content.
  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const variants: Variants = {
    hidden: { opacity: 0, y },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration, delay, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -80px 0px" }}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
