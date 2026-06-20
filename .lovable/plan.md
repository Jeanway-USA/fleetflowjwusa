## Landing Page Redesign — Plan

Premium SaaS landing page rebuild for `src/pages/Landing.tsx`, anchored on the locked design tokens you picked:

- **Palette (Noir & Gold):** `#0d0d0d` background, `#1a1a1a` elevated surfaces, `#c9a84c` primary gold, `#f0d78c` highlight gold. Already aligns with current `--primary 45 80% 50%` tokens — no token changes needed.
- **Typography:** Space Grotesk (headings) + DM Sans (body), loaded via `@fontsource` and wired into `tailwind.config.ts` as `font-heading` / `font-sans`.
- **Layout:** Hero + Card Grid, with soft-shadow cards, subtle gold radial-gradient hero glow, and hover lift micro-interactions.

### ⚠️ One callout before I build

Task 4 asks for an **"HOS Snapshots"** card, but project memory explicitly says HOS tracking was removed from the UI because it's handled by external ELD hardware. Putting it on the marketing page would over-promise a feature the app doesn't ship. I'd like to swap that third Safety card for something the platform actually does. Two options — tell me which you prefer (or propose your own copy):

- **A. Predictive PM Alerts** — "Automated 2,000-mile / 14-day preventive-maintenance alerts keep trucks legal and on the road."
- **B. Driver Performance Scorecards** — "Multi-metric safety + efficiency scoring with leaderboards to reward your best operators."

I'll default to **A (Predictive PM Alerts)** if you don't specify.

### Page structure

```text
┌──────────────────────────────────────────────────────────┐
│  Sticky nav  (logo · Features · Pricing · Login · Demo)  │
├──────────────────────────────────────────────────────────┤
│  HERO  — gold radial glow on noir                        │
│   Eyebrow chip: "v2026 · Next-Gen TMS"                   │
│   H1 (Space Grotesk):                                    │
│     "Next-Generation Fleet Management                    │
│      & Driver Intelligence."                             │
│   Sub: "Bridging the gap between dispatchers,            │
│         owner-operators, and compliance..."              │
│   CTAs: [ Smart Primary ] [ Try Live Demo ]              │
│   Trust strip: 4 existing STATS                          │
├──────────────────────────────────────────────────────────┤
│  SECTION 1 — Dispatcher Superpowers (3-col grid)         │
│   Search · Map · Receipt icons                           │
├──────────────────────────────────────────────────────────┤
│  SECTION 2 — The Driver Experience (3-col grid)          │
│   WifiOff · DollarSign · MapPinned icons                 │
├──────────────────────────────────────────────────────────┤
│  SECTION 3 — Safety & Compliance (3-col grid)            │
│   CloudLightning · ShieldCheck · Wrench(or BarChart)     │
├──────────────────────────────────────────────────────────┤
│  Pricing teaser (kept from current page)                 │
│  Footer (kept from current page)                         │
└──────────────────────────────────────────────────────────┘
```

### Component / interaction details

- **Smart CTA:** on mount check `supabase.auth.getSession()`; if session exists CTA reads "Go to Dashboard" → `/`, otherwise "Login" → `/auth`. Secondary CTA keeps existing `handleDemoLogin`.
- **Feature cards:** shadcn `Card` with `bg-card/60 backdrop-blur border-border/60`, gold icon chip (`bg-primary/10 text-primary rounded-lg p-3`), `transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]`.
- **Hero glow:** absolutely-positioned `bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]`, plus a faint grid SVG mask. No custom hex colors anywhere — semantic tokens only.
- **RevealOnScroll** wraps each section (already in project) for staggered fade-up.
- **Responsive:** grids `grid-cols-1 md:grid-cols-3`, hero text `text-4xl md:text-6xl lg:text-7xl`, mobile sheet nav kept.
- **A11y / SEO:** single `<h1>`, semantic `<section aria-labelledby>` per block, keep existing `<Helmet>` (light copy refresh to match new headline), preserve canonical.

### Technical changes

1. `bun add @fontsource/space-grotesk @fontsource/dm-sans`
2. `src/main.tsx` — add `import '@fontsource/space-grotesk/400.css'; import '@fontsource/space-grotesk/600.css'; import '@fontsource/space-grotesk/700.css'; import '@fontsource/dm-sans/400.css'; import '@fontsource/dm-sans/500.css';`
3. `tailwind.config.ts` — extend `fontFamily: { heading: ['"Space Grotesk"', ...], sans: ['"DM Sans"', ...] }`.
4. `src/pages/Landing.tsx` — rewrite the marketing surface (hero + 3 feature grids); keep the existing pricing teaser, footer, mobile sheet nav, demo-login handler, stats array, and Helmet block intact.
5. No backend, schema, RLS, or routing changes.

### Out of scope

- No changes to `/auth`, dashboard, or any feature page.
- No new images generated unless you want a hero illustration (say the word and I'll add one premium-quality asset).
- No design-token / theme changes — Noir & Gold already matches current CSS variables.

Approve and I'll build it; reply with A or B (or your own copy) for the third Safety card.