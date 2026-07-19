# Bullseye — 3D Premium Redesign Master Plan

> Direction locked 2026-07-13: **Premium & smooth** (tasteful 3D + scroll
> storytelling, guaranteed ~60fps with graceful fallback — NOT heavy full-3D on
> every page) and **Foundation first** (fix the code before the visuals).
>
> This is a multi-week effort. Every phase is broken into small steps, each ending
> in its own commit, so it can pause/resume without collapsing (past redesigns
> failed because they were done in one big unverifiable push against a monolith).
>
> Progress tracker (tick as you go):
> - [ ] Phase A — Foundation & cleanup (invisible, unblocks everything)
> - [ ] Phase B — Design system + motion/3D engine
> - [ ] Phase C — Homepage storyline (first big visible win)
> - [ ] Phase D — Screener page
> - [ ] Phase E — Ask AI page
> - [ ] Phase F — Stock detail pages
> - [ ] Phase G — Performance + infra hardening

---

## §0 Principles (read every session)

- **One animation system, not five.** Standardize on: `framer-motion` (already
  installed as `motion`) for UI/scroll reveals + `@react-three/fiber` + `drei`
  for real 3D + `lenis` (installed) for smooth scroll + `gsap` ScrollTrigger only
  if a timeline needs it. No ad-hoc `requestAnimationFrame` soup.
- **One 3D canvas per page, max.** Mounted via a shared `<Scene3D>` that: gates on
  a device-capability tier, pauses when off-screen/tab-hidden, caps DPR, and
  respects `prefers-reduced-motion`. Never two WebGL contexts on a page.
- **Performance budget (enforced each phase):** homepage JS < ~250KB gz to
  interactive; Lighthouse Performance ≥ 85 desktop / ≥ 70 mobile; 60fps scroll on
  a mid-range phone. Measure before/after — no "felt faster."
- **Graceful degradation is the smoothness guarantee.** Detect a `deviceTier`
  (low/med/high) once on load (cores, memory, mobile, reduced-motion). high →
  full 3D; med → simplified 3D / fewer particles; low → static hero image +
  CSS-only motion. This is HOW "no lag" is achieved.
- **Dark-first, single theme.** Kill the light/dark split — the app is now the
  immersive dark theme everywhere. Delete `.bullseye-light`/`.bullseye-night`
  hacks once components are dark by default.
- **Every visible phase ends verified** (production build + owner screenshot,
  since the in-app preview pane is unreliable in this environment).

---

## Phase A — Foundation & cleanup  ← START HERE

The `app/page.tsx` monolith (~4,900 lines: homepage + stock modal + news + nav +
ticker + auth/daily-signal modals + all data hooks + two themes) is why redesigns
break. Make it a thin composition of modules. **No visual change intended** — pure
structure + speed.

- [ ] **A1 — Baseline & guardrails.** Add `@next/bundle-analyzer`; record current
  homepage bundle size + a Lighthouse run (desktop+mobile) into
  `docs/perf-baseline.md`. This is the number every later phase is graded against.
- [ ] **A2 — Extract the stock detail view** (the `StockCard` dialog + its chart)
  into `components/stock/StockDetailModal.tsx`. Biggest single chunk.
- [ ] **A3 — Extract shell pieces**: nav, ticker tape, account menu, auth modal,
  daily-signal modal, global-news panel → `components/shell/*` and
  `components/home/*`. `page.tsx` should read like a table of contents.
- [ ] **A4 — Extract data logic** into hooks: `useMarketQuotes`, `useAnalysis`,
  `useStockSearch`, etc. under `hooks/`. Pure functions, no JSX.
- [ ] **A5 — Fonts → `next/font`.** Remove the render-blocking Google Fonts
  `@import` inside components (TextPressure etc.); self-host via next/font.
- [ ] **A6 — Split heavy imports** with `dynamic()` (charts, 3D, detail modal,
  markdown) so they don't ship in the first load.
- [ ] **A7 — Re-measure** vs A1 baseline; commit the delta. Target: first-load JS
  down meaningfully, Lighthouse up.

Acceptance: `page.tsx` under ~800 lines; bundle + Lighthouse measurably better;
app behaves identically. Commit per step.

---

## Phase B — Design system + motion/3D engine

The reusable machinery every page will use. Build once, use everywhere.

- [ ] **B1 — Tokens.** Consolidate color/space/radius/type into one source
  (extend `globals.css` `@theme`); dark-first. Delete the light-theme values once
  unused.
- [ ] **B2 — Primitives.** Audit/rebuild `components/ui/*` (Card, Button, Stat,
  Pill, Input) dark-first with consistent glass, focus rings, and motion-ready
  props. This kills the "invisible text on glass" class of bugs for good.
- [ ] **B3 — `<Scene3D>`** wrapper: a single R3F `<Canvas>` with `deviceTier`
  gating, `frameloop="demand"` where possible, IntersectionObserver pause, DPR
  cap, reduced-motion + WebGL-support fallback to a static image. Every page's 3D
  goes through this.
- [ ] **B4 — Motion primitives**: `<Reveal>`, `<Stagger>`, `useParallax`,
  `<MagneticButton>`, and a shared page-transition wrapper (framer-motion
  `AnimatePresence` on route change). Lenis smooth-scroll set up ONCE globally.
- [ ] **B5 — `deviceTier` hook** + a `<MotionProvider>` that exposes it so every
  component can scale itself down on weak devices.

Acceptance: a Storybook-ish demo route (`/_lab`) showing the primitives; 60fps.

---

## Phase C — Homepage storyline (first big visible win)

A scroll-driven narrative. Proposed beats (adjust to the reference the owner
shares): 1) **Hero** — a slow-rotating 3D "bullseye/target" with market-data
particles + the Lightfall backdrop, headline resolves in. 2) **Scroll to
"Scan"** — the 7 featured stock cards fly/tilt into a constellation. 3) **"Screen
in English or SQL"** beat. 4) **"Honest conviction"** beat. 5) **"Signals"** CTA.
Built on Phase B primitives; `<Scene3D>` hero; sticky-scroll sections; the
existing 7-stock featured grid gets the motion treatment.

Acceptance: homepage tells a story on scroll, 60fps on mid phone, static-but-clean
on low tier. Owner screenshot sign-off.

---

## Phase D — Screener page
Immersive dark screener: animated results (stagger-in rows), the English⇄SQL
toggle from a prior phase, a subtle 3D/particle header, smooth route transition in
from the homepage. Reuse Phase B.

## Phase E — Ask AI page
Conversational UI polish: message reveal animations, a reactive 3D "assistant"
accent, streaming-friendly motion. Reuse Phase B.

## Phase F — Stock detail pages
The detail view (extracted in A2) gets a 3D price-surface / animated chart entrance
and section transitions. Reuse Phase B.

---

## Phase G — Performance + infra hardening
- [ ] Cache read-heavy APIs (snapshot/screener/quotes) — Next route-segment
  caching and/or **Cloudflare in front of the Render backend** (edge-cache the
  reads for a few minutes). NOTE: do NOT move the frontend off Vercel — it already
  has a global CDN; the win is caching the API + keeping the backend warm.
- [ ] Decide backend always-on (Render Starter ~$7/mo or Fly/Railway) to kill cold
  starts, vs the current keep-alive cron.
- [ ] Final Lighthouse + real low-end-device pass; fix the worst offenders.
- [ ] Remove dead code/assets; tree-shake; verify bundle budget held.

---

### Notes
- Reference: owner mentioned wanting a storyline like "crediq" — pending a
  link/screenshots to match that specific vibe; until then Phase C uses Bullseye's
  own target/market metaphor.
- Do phases in order (A→G). A and B are the unglamorous but load-bearing ones.
- After each phase: production build + owner screenshot before moving on.
