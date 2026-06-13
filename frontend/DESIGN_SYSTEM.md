# Bullseye Design System

This file is the single source of truth for the redesign. Later phases must use
these tokens and primitives rather than inventing new colors, type styles, card
styles, or spacing rules.

Hard rule: colors are locked. The values below were extracted from
`frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`,
`frontend/app/ask-ai/page.tsx`, `frontend/app/screens/page.tsx`, and the
`ui-mockups/*.html` explorations.

## Current Theme Audit

The product currently mixes a light public shell with dark fintech research
surfaces:

- Homepage and screener light shell: `#f8fcff`, `#edf7f8`, `#ffffff`,
  translucent white cards, cyan/emerald radial glows, `text-slate-950`.
- Research and modal surfaces: `bg-slate-950`, `bg-black/50`,
  `bg-white/[0.04]`, `border-white/10`, `text-slate-300`, cyan accents.
- Ask AI is mostly light glass: white cards, `border-slate-200`,
  cyan/emerald gradient action bubbles, and slate body text.
- The stock dashboard and notification modal use the darker card language.
- `ui-mockups/redesign.html` is the preferred layout reference: ticker tape,
  glass nav/search, data-dense signal rows, command-like CTAs, dense cards, and
  restrained radial glow. Other mockups are reference only and must not introduce
  their alternate palettes.

## Color Tokens

The semantic CSS variables live in `frontend/app/globals.css`.

| Token | Exact value or source | Current usage |
| --- | --- | --- |
| `--bg` | `#020617` (`slate-950`) | Dark app canvas, dark cards |
| `--bg-soft` | `#0f172a` (`slate-900`) | Dark elevated wells, dark buttons |
| `--bg-elevated` | `#111827` | Deep modal/account surfaces |
| `--page-light` | `#f8fcff` | Light homepage/screener canvas |
| `--page-light-mid` | `#edf7f8` | Light page gradient middle |
| `--surface` | `rgba(255,255,255,0.04)` | Dark glass cards |
| `--surface-strong` | `rgba(255,255,255,0.06)` | Stronger dark glass cards |
| `--surface-light` | `rgba(255,255,255,0.82)` | Light glass cards |
| `--surface-inset` | `rgba(0,0,0,0.50)` | Inputs, wells, code-like panels |
| `--line` | `rgba(255,255,255,0.10)` | Dark hairline borders |
| `--line-light` | `rgba(15,23,42,0.10)` | Light hairline borders |
| `--accent` | `#22d3ee` (`cyan-400`) | Primary accent, scan line, active bars |
| `--accent-soft` | `#67e8f9` (`cyan-300`) | Eyebrows, glows, active borders |
| `--accent-strong` | `#06b6d4` (`cyan-500`) | Hover and gradient stops |
| `--positive` | `#34d399` (`emerald-400`) | Buy/up/gain states |
| `--positive-soft` | `#86efac` (`emerald-300`) | Soft positive text/glow |
| `--negative` | `#fb7185` (`rose-400`) | Sell/down/loss states |
| `--negative-strong` | `#ef4444` (`red-500`) | Strong sell bars and errors |
| `--caution` | `#fcd34d` (`amber-300`) | Caution/hold/warning states |
| `--muted` | `#94a3b8` (`slate-400`) | Muted text, placeholders |

Tailwind v4 aliases also exist: `bg-bg`, `bg-bg-soft`, `bg-page-light`,
`bg-surface-glass`, `bg-surface-light`, `border-line`, `border-line-light`,
`text-accent`, `text-positive`, `text-negative`, `text-caution`, and
`text-muted`.

Common literal classes are still valid and pixel-equivalent:

- Canvas: `bg-slate-950`, `bg-[#f8fcff]`
- Surfaces: `bg-white/[0.04]`, `bg-white/5`, `bg-white/80`, `bg-black/50`
- Borders: `border-white/10`, `border-slate-200`, `border-cyan-200`
- Primary text: `text-slate-950` on light, `text-slate-50` or `text-white` on
  dark surfaces
- Body text: `text-slate-500`, `text-slate-400`, `text-slate-300`
- Accent: `text-cyan-300`, `text-cyan-400`, `bg-cyan-400`, `bg-cyan-500`
- Directional: `text-emerald-300`, `bg-emerald-400`, `text-rose-300`,
  `bg-red-500`, `text-amber-300`

Brand mark gradient is locked:
`linear-gradient(135deg,#a7f3e8,#22d3ee 55%,#34d399)`.

## Typography

Use two intentional UI fonts:

| Role | Font | Rules |
| --- | --- | --- |
| Display | `Space Grotesk` | Brand, H1/H2/H3, section eyebrows, button labels, ticker names, card titles. Use uppercase sparingly, usually with `font-black` and `tracking-[0.14em]` to `tracking-[0.2em]` for labels. |
| Data | `JetBrains Mono` | Prices, confidence, risk/reward, tickers, percentages, table cells, compact metadata, command/search inputs. Use tabular, compact, and high contrast. |

Body copy currently falls back through Inter/Plus Jakarta/Geist/system sans.
Do not introduce another display or data font. The layout also loads Geist and
Geist Mono variables for compatibility, but redesign components should use
Space Grotesk for display and JetBrains Mono for data.

Type scale:

- Eyebrow: `text-[10px] font-black uppercase tracking-[0.18em]`
- Small metadata: `text-[10px]` to `text-xs`, usually JetBrains Mono
- Body: `text-sm` or `text-base`, `leading-relaxed`
- Card title: `text-base` to `text-xl`, Space Grotesk, `font-black`
- Section title: `text-2xl` to `text-4xl`, Space Grotesk, `font-black`
- Hero: `text-4xl` to `text-6xl`, Space Grotesk, `font-black`,
  `tracking-tight`

## Spacing, Radius, Border, Shadow, Motion

Spacing:

- Page gutters: `px-3 sm:px-6 lg:px-8` for the wide homepage,
  `px-4 sm:px-6` for standard pages.
- Page max width: `max-w-[1600px]` for the homepage/trading surface,
  `max-w-7xl` for narrower marketing or admin layouts.
- Card padding: `p-4`, `p-5`, `p-6`; large feature panels may use `p-7`.
- Internal gaps: `gap-2` to `gap-4` for dense controls, `gap-6` for sections.

Radius:

- `rounded-xl`: compact controls, table controls, small buttons.
- `rounded-2xl`: default cards, inputs, buttons, pills with content.
- `rounded-3xl`: large panels, modals, homepage sections.
- `rounded-full`: avatars, dots, tight status pills.

Borders:

- Dark default: `border border-white/10`
- Light default: `border border-slate-200` or `border-white/70`
- Active/focus: `border-cyan-300`, `border-cyan-400`, `focus:ring-cyan-400`
- Directional: `border-emerald-300/30`, `border-rose-300/30`,
  `border-amber-300/30`

Shadows:

- Light card: `shadow-[0_18px_55px_rgba(15,23,42,0.08)]`
- Light hover: `shadow-[0_26px_70px_rgba(8,145,178,0.16)]`
- Dark modal: `shadow-[0_28px_90px_rgba(15,23,42,0.5)]`
- Brand/CTA glow: `shadow-[0_12px_32px_rgba(6,182,212,0.28)]`

Motion:

- Use existing `.animate-rise`, `.animate-marquee`, and `dot-bounce`.
- Hover motion may translate by `-translate-y-0.5` or `-translate-y-1`.
- Transitions should stay in the 150ms to 300ms range.
- Avoid ornamental motion that competes with data scanning.

## Design Language

Target feel: modern fintech, clean, data-dense but breathable, strong visual
hierarchy, consistent grid, card-based surfaces, and restrained motion.

Principles:

1. Keep cyan as the only action accent. Emerald, rose, and amber are reserved
   for market direction and warning states.
2. Use the eyebrow pattern: small uppercase label, strong heading, short support
   copy.
3. Cards should feel like working surfaces, not decorative content blocks.
4. Every data panel needs a loading, empty, or unavailable state.
5. Dense content needs clear scanning anchors: labels, mono values, status dots,
   and consistent grid tracks.
6. Homepage sections may use the current light shell, but dark research panels
   remain valid when the content is signal-heavy.

Grid and breakpoints:

- Mobile first.
- Tailwind breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- Homepage uses `max-w-[1600px]` and can split into a main column plus a
  `360px` to `390px` side rail at `xl`.
- Standard sections use 1 column on mobile, 2 columns at `md`, and 12-column
  composition at `lg`.

## Component Catalog

All shared primitives live in `frontend/components/ui/` and export from
`@/components/ui`.

| Component | Purpose | Variants and props |
| --- | --- | --- |
| `cn` | Dependency-free className joiner | Accepts strings, numbers, false, null, undefined |
| `Card` | Standard surface wrapper | `variant`: `glass`, `solid`, `inset`; `padding`: `none`, `sm`, `md`, `lg`; `interactive`, `className` |
| `Button` | Native button actions | `variant`: `primary`, `secondary`, `ghost`, `danger`; `size`: `sm`, `md`, `lg`; `block`, native button props |
| `Eyebrow` | Signature uppercase label | `tone`: `accent`, `muted`; `as`: `span`, `div`, `p` |
| `Badge` | Compact status chip | `tone`: `neutral`, `accent`, `positive`, `negative`, `caution`; `pill` |
| `Pill` | Rounded status chip | Same props as `Badge`, always rounded-full |
| `Stat` / `Metric` | Label/value metric block | `label`, `value`, `hint`, `tone`: `default`, `positive`, `negative`, `caution`, `accent`; `Metric` is an alias |
| `Input` | Theme input | Native input props, `invalid` |
| `Select` | Styled native select | Native select props |
| `Tabs` | Controlled segmented tabs | `tabs`, `value`, `onValueChange`, `className` |
| `Modal` | Client overlay dialog | `open`, `onClose`, `title`, `size`: `sm`, `md`, `lg` |
| `Tooltip` | Client hover/focus hint | `content`, `children`, `side`: `top`, `bottom` |
| `SectionHeading` | Eyebrow/title/description/actions block | `eyebrow`, `title`, `description`, `actions` |
| `Skeleton` | Loading placeholder | Shape via `className` |
| `EmptyState` | Empty/no-data panel | `title`, `description`, `icon`, `action` |
| `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` | Responsive table primitives | Compose directly; mobile stacking belongs in feature components |

Interactive primitives (`Tabs`, `Modal`, `Tooltip`) are client components. Pure
display primitives stay server-safe.

## Homepage Components

Homepage-only presentation belongs in `frontend/components/home/`.

| Component | Purpose |
| --- | --- |
| `HomeHero` | First viewport hero, stats, and CTAs |
| `MarketSwitcher` | India/US market selector |
| `MarketScanSection` | Live stock grid shell and pagination |
| `DailySignalPreviewCard` | Daily email signal preview and alert CTAs |
| `HomeFeatureSection` | Marketing/features and final CTAs |

These components must not own SWR, fetch calls, stock lists, auth state, or
market handlers. `frontend/app/page.tsx` owns all data and passes props down.

## Guardrails

- Do not change colors. Add aliases only when they point to values above.
- Do not move data fetching into presentational components.
- Preserve SWR keys and backend paths exactly unless a phase explicitly asks for
  data behavior changes.
- Preserve the stock detail dashboard when working on homepage-only phases.
- Prefer existing primitives and layout components over new ad hoc card styles.
- Light vs dark surfaces: the shared primitives (`Card` glass, `SectionHeading`,
  `EmptyState`, `Badge` accent → `text-cyan-300`) are tuned for DARK backgrounds
  and read as low-contrast on the light shell. On light pages use either an
  explicit-color primitive (`Button`, which is high-contrast on light) or a light
  pill/eyebrow at `text-cyan-700` on `bg-cyan-50`. Do not place `text-cyan-300`
  text on near-white backgrounds.
- Run `npx tsc -p tsconfig.json --noEmit` before committing.
