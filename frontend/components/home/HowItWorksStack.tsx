"use client";

// "How Bullseye works" — React Bits ScrollStack on desktop (cards pin & stack
// inside their own scroller, so normal page scroll is never hijacked), plain
// responsive grid on mobile / reduced-motion.

import { useEffect, useState } from "react";
import ScrollStack, { ScrollStackItem } from "@/components/reactbits/ScrollStack";

const STEPS = [
  {
    step: "01",
    title: "Scan the market",
    body: "Live NSE, BSE and NASDAQ quotes with FISO verdicts on featured stocks — the homepage stays fast while verdicts stream in as you scroll.",
    gradient: "linear-gradient(135deg, #ecfeff 0%, #cffafe 55%, #a5f3fc 100%)",
    accent: "#0891b2",
  },
  {
    step: "02",
    title: "Screen in English or SQL",
    body: "Type “profitable smallcaps with low debt and RSI under 40” — or raw SQL. The AI turns it into a real query over 2,000+ stocks and shows you the SQL it ran.",
    gradient: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 55%, #a7f3d0 100%)",
    accent: "#059669",
  },
  {
    step: "03",
    title: "Analyze with honest conviction",
    body: "Every setup ships entry, target and stop-loss with a day-level conviction label. Weak day? Bullseye says “sit out” instead of forcing a trade.",
    gradient: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 55%, #bfdbfe 100%)",
    accent: "#2563eb",
  },
  {
    step: "04",
    title: "Get signals by email",
    body: "Daily post-close signal emails on your schedule — ranked picks, reasoning included, no spam on no-signal days.",
    gradient: "linear-gradient(135deg, #fefce8 0%, #fef9c3 55%, #fde68a 100%)",
    accent: "#d97706",
  },
];

function StepCardContent({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <span
          className="font-['JetBrains_Mono'] text-xs font-black tracking-[0.3em]"
          style={{ color: step.accent }}
        >
          {step.step}
        </span>
        <h3 className="mt-3 font-['Space_Grotesk'] text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          {step.title}
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{step.body}</p>
      </div>
      <div className="mt-6 h-1 w-16 rounded-full" style={{ backgroundColor: step.accent }} />
    </div>
  );
}

export function HowItWorksStack() {
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const check = () => setStacked(window.innerWidth >= 1024 && !media.matches);
    check();
    window.addEventListener("resize", check);
    media.addEventListener?.("change", check);
    return () => {
      window.removeEventListener("resize", check);
      media.removeEventListener?.("change", check);
    };
  }, []);

  return (
    <section className="rounded-2xl border border-white/70 bg-white/82 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:rounded-3xl sm:p-6">
      <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
        How it works
      </span>
      <h2 className="mt-3 font-['Space_Grotesk'] text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
        From market noise to one clear setup
      </h2>

      {stacked ? (
        <div className="mt-4 h-[560px] overflow-hidden rounded-2xl border border-slate-100">
          <ScrollStack itemDistance={90} itemStackDistance={26} baseScale={0.88} stackPosition="16%">
            {STEPS.map(step => (
              <ScrollStackItem key={step.step}>
                <div
                  className="flex h-[240px] flex-col rounded-[32px] p-2"
                  style={{ background: step.gradient }}
                >
                  <div className="flex h-full flex-col rounded-[26px] bg-white/72 p-6 backdrop-blur-sm">
                    <StepCardContent step={step} />
                  </div>
                </div>
              </ScrollStackItem>
            ))}
          </ScrollStack>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STEPS.map(step => (
            <div key={step.step} className="rounded-2xl p-1.5" style={{ background: step.gradient }}>
              <div className="h-full rounded-xl bg-white/75 p-5">
                <StepCardContent step={step} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default HowItWorksStack;
