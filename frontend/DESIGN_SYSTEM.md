# Bullseye — Design System

> **This file is the single source of truth for the UI redesign.** Every redesign
> phase (homepage, screener, Ask AI, stock page, alerts, polish) must read this
> file first and build only from the tokens and primitives below.
>
> **Hard rule:** the **color palette and fonts do not change.** These tokens were
> *extracted from the live app*, not invented. You may restructure layout,
> hierarchy, spacing, density, components, and motion — never the colors.

---

## 1. How the theme actually works

The app is **dark-only** and themed almost entirely with **Tailwind v4 utility
classes** (e.g. `bg-slate-950`, `text-cyan-300`, `border-white/10`). `globals.css`
is near-default Next boilerplate; the real palette lives in the markup. The
redesign keeps using these exact utilities so colors never drift.

Two font families do the heavy lifting, applied as arbitrary Tailwind values:
- `font-['Space_Grotesk']` — display / headings / eyebrow labels / tickers
- `font-['JetBrains_Mono']` — numbers, data, metrics, code-like labels

(Body text falls back to the loaded Plus Jakarta Sans / Geist sans.)

> Layout inspiration: `ai-trading-mvp/ui-mockups/redesign.html` (glass nav with a
> centered command search, gradient brand mark, ticker tape, eyebrow labels,
> chips, big gradient H1, radial-glow backgrounds). Its palette matches the live
> theme, so borrow its **structure**, keep our **colors**.

---

## 2. Color tokens (LOCKED — extracted from the live app)

| Semantic name      | Tailwind class(es)                          | Use |
|--------------------|---------------------------------------------|-----|
| **bg / page**      | `bg-slate-950`                              | App background, solid panels |
| **surface**        | `bg-white/[0.04]`, `bg-white/5`             | Elevated cards on the dark bg |
| **surface-inset**  | `bg-black/50`, `bg-black/40`                | Inputs, wells, code areas |
| **line / border**  | `border-white/10`                           | Default hairline borders |
| **text-primary**   | `text-white`                                | Headings, key values |
| **text-body**      | `text-slate-300`                            | Paragraph / default body |
| **text-muted**     | `text-slate-400`                            | Secondary, captions, labels |
| **accent**         | `text-cyan-300`                             | Eyebrow labels, links, accents |
| **accent-fill**    | `bg-cyan-400` + `text-slate-950` (hover `bg-cyan-300`) | Primary buttons / CTAs |
| **accent-tint**    | `bg-cyan-500/15`, `border-cyan-300`         | Chips, active states, focus ring |
| **positive**       | `text-emerald-300`, `bg-emerald-400`, `border-emerald-300` | Buy / up / gains |
| **negative**       | `text-rose-300`/`text-red-200`, `bg-rose-*`/`bg-red-500`, `border-rose-*`/`border-red-400` | Sell / down / loss |
| **caution**        | `text-amber-300`, `bg-amber-400`, `border-amber-300` | Warnings, low-conviction, holds |
| **on-accent**      | `text-slate-950`                            | Text on cyan/emerald fills |

**Verdict gradients** (used for buy/sell glow + gradient text):
`from-emerald-400` (bull), `from-rose-400` (bear), `from-slate-400` (neutral),
`from-cyan-300` (brand). Brand mark gradient: `linear-gradient(135deg,#a7f3e8,#22d3ee 55%,#34d399)`.

Optional semantic utilities are also defined in `globals.css` (`bg-surface`,
`text-accent`, `text-positive`, etc.) that alias these exact colors — use either
the literal class or the semantic alias; both render identically.

---

## 3. Typography

| Role            | Spec |
|-----------------|------|
| **Eyebrow label** | `text-[10px] font-black uppercase tracking-[0.18em] font-['Space_Grotesk']`, usually `text-cyan-300` or `text-slate-400`. The signature Bullseye label. |
| **Display H1**  | `font-['Space_Grotesk']` `font-extrabold` `tracking-tight`, ~`text-4xl`→`text-6xl`. Often a gradient-clipped span. |
| **Heading**     | `font-['Space_Grotesk']` `font-bold`, `text-xl`→`text-2xl`, `text-white`. |
| **Body**        | default sans, `text-sm`/`text-base`, `text-slate-300`, `leading-relaxed`. |
| **Data / metric** | `font-['JetBrains_Mono']`, value `font-bold text-white`, label as eyebrow. |
| **Tracking**    | Eyebrows use `tracking-[0.14em]`–`tracking-[0.2em]`. |

---

## 4. Shape, elevation, spacing, motion

- **Radii:** `rounded-2xl` (cards, buttons, inputs — default), `rounded-3xl`
  (large panels / modals), `rounded-full` (pills, dots, avatars).
- **Borders:** `border border-white/10` default; accent/active → `border-cyan-300|400`.
- **Elevation:** glass surfaces use `backdrop-blur-sm|md|2xl`. Large shadow:
  `shadow-[0_28px_90px_rgba(15,23,42,0.5)]`; soft: `shadow-[0_18px_55px_rgba(15,23,42,0.08)]`.
- **Card padding:** `p-5` / `p-6` (mobile→desktop); compact rows `p-3`.
- **Section rhythm:** vertical gaps `gap-3`/`gap-4` inside cards, `gap-6`/`gap-8` between sections; page gutters `px-4 sm:px-6`.
- **Backgrounds:** radial-glow accents allowed, e.g.
  `radial-gradient(60% 40% at 80% -5%, rgba(34,211,238,.10), transparent 60%)`.
- **Motion (already in `globals.css`):** `.animate-rise` (entrance),
  `.animate-marquee` (ticker), `dot-bounce` (typing). Keep motion restrained:
  150–300ms, `transition`, ease-out. Respect `prefers-reduced-motion`.

---

## 5. Design language / principles

1. **Modern fintech, dark glass.** Deep `slate-950` canvas, translucent
   white-alpha cards, cyan as the single action accent, emerald/rose strictly for
   directional data, amber for caution.
2. **Hierarchy via the eyebrow pattern.** Tiny uppercase tracked label →
   display heading → supporting body. Used on every section and card.
3. **Data-dense but breathable.** Generous radii and padding; numbers in
   JetBrains Mono so they read as data.
4. **One accent.** Cyan drives all primary actions/links. Don't introduce new hues.
5. **Consistent surfaces.** Everything sits on `rounded-2xl` white-alpha cards with
   `border-white/10`. No ad-hoc card styles.
6. **Honest states.** Every data surface has explicit loading (skeleton), empty,
   and error states — never a blank box.
7. **Restrained motion.** Subtle entrance/hover only; nothing that distracts from data.

**Grid & breakpoints:** mobile-first, Tailwind defaults (`sm 640 / md 768 /
lg 1024 / xl 1280`). Page max-width container ~`max-w-7xl mx-auto`. Content grids
use 12 columns at `lg` (`lg:grid-cols-12`) collapsing to 1 column on mobile.

---

## 6. Component catalog (`frontend/components/ui/`)

All primitives are TypeScript, theme-accurate, and composable via a `className`
override (merged with the local `cn()` helper). Import from `@/components/ui`.

| Component | Purpose | Key props / variants |
|-----------|---------|----------------------|
| `cn(...)` | className merge helper (no deps) | — |
| `Card` | Standard glass surface | `variant`: `glass`\|`solid`\|`inset`; `padding`: `none`\|`sm`\|`md`\|`lg`; `as`, `interactive` |
| `Button` | Actions | `variant`: `primary`\|`secondary`\|`ghost`\|`danger`; `size`: `sm`\|`md`\|`lg`; `block` |
| `Eyebrow` | The signature uppercase tracked label | `tone`: `accent`\|`muted`; `as` |
| `Badge` / `Pill` | Status chips | `tone`: `neutral`\|`accent`\|`positive`\|`negative`\|`caution`; `Pill` is rounded-full |
| `Stat` | Label + value metric block | `label`, `value`, `hint`, `tone` |
| `Input` | Text/number/time input | native input props; `invalid` |
| `Select` | Styled native select | native select props; `children` = options |
| `Tabs` | Tabbed switcher (client) | `tabs: {id,label}[]`, `value`, `onValueChange` |
| `Modal` | Overlay dialog (client) | `open`, `onClose`, `title`, `size` |
| `Tooltip` | Hover hint (client) | `content`, `children`, `side` |
| `SectionHeading` | Eyebrow + title + description + actions | `eyebrow`, `title`, `description`, `actions` |
| `Skeleton` | Loading placeholder | `className` for shape |
| `EmptyState` | Empty/no-data panel | `title`, `description`, `icon`, `action` |
| `Table` + `THead/TBody/TR/TH/TD` | Data tables (responsive) | compose; mobile → stacked cards in feature code |

### Usage examples

```tsx
import { Card, Button, Eyebrow, Badge, Stat, SectionHeading } from "@/components/ui";

<Card>
  <Eyebrow>Signal 1</Eyebrow>
  <h3 className="mt-1 font-['Space_Grotesk'] text-2xl font-bold text-white">TCS</h3>
  <Badge tone="positive">BUY</Badge>
  <Stat label="Confidence" value="62%" />
  <Button variant="primary" size="md">View analysis</Button>
</Card>
```

---

## 7. Guardrails for every phase

- Do **not** change colors or fonts. Reuse the tokens/classes above verbatim.
- Do **not** touch data fetching, SWR keys, API URLs, Supabase auth, or handlers —
  presentational refactor only.
- Compose from `@/components/ui`; extract feature components under
  `frontend/components/<feature>/`. Keep data/logic in the page; pass via props.
- Interactive primitives (`Tabs`, `Modal`, `Tooltip`) are `"use client"`. Pure
  display primitives are server-safe (no directive) and work in either context.
- Verify each phase: `npx tsc -p tsconfig.json --noEmit` passes, `npm run dev`
  renders, browser console is clean. Then commit.
