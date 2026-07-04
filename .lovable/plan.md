## Goal

Replace the "Bloomberg terminal" styling at the top of the Finance → Overview & P&L tab with the app's standard Shadcn / Tailwind design language. Keep the exact layout, data, and calculations — only the presentation layer changes.

Scope is limited to the top command-center block in `src/components/finance/PLSummaryTab.tsx` (lines ~105–334) plus the `RatioCell` helper at the bottom of the same file. The rest of the file (Revenue Flow, Revenue Summary, Miles Summary, etc.) already uses the design system and stays untouched.

## Changes

**1. Container**
- Drop the outer dark wrapper (`bg-[#0A0E14]`, `border-[#1E2530]`, ticker strip with "FLEET P&L · LIVE · UPDATED …" and "WINDOW · 7-DAY").
- Replace with a plain vertical stack of standard `<Card>` blocks, matching the spacing used further down the page.

**2. KPI cards (Gross Revenue / Dispatched Expenses / Net Operating Margin)**
- Wrap each in `<Card>` with `<CardHeader>` + `<CardContent>`, `rounded-xl`, `border-border`, `bg-card`.
- Header row: small icon + label using `text-sm text-muted-foreground` with normal tracking (no uppercase / no `[0.2em]` letter-spacing, no monospace).
- Main number: `text-3xl font-semibold text-foreground` (sans-serif, `tabular-nums` kept for alignment). No neon green/red on the currency itself.
- Sub-line: `text-xs text-muted-foreground` (e.g. "12 loads · 4,320 mi", "Payroll · Commissions · Opex").
- On the Net Operating Margin card, color **only** the margin delta (`↑ 12.40%` / `↓ 3.10%`) with `text-green-600` or `text-destructive` and a `TrendingUp` / `TrendingDown` icon. The dollar value stays `text-foreground`.

**3. Operational Ratios (RPM / EPM / NPM)**
- Single `<Card>` with a `<CardHeader>` containing the title "Operational Ratios · Per Mile" (`CardTitle`, standard font) and the timeframe control on the right.
- Timeframe control: standard Shadcn `<Tabs>` with triggers `Week`, `Month`, `Quarter` (replaces the custom-styled ToggleGroup). Values still drive the existing `timeframe` state.
- Body: 3-column grid (`sm:grid-cols-3`, `divide-x divide-border`) of `RatioCell`s.
- Rewrite `RatioCell` to use sans-serif, `text-muted-foreground` label, `text-2xl font-semibold text-foreground tabular-nums` value, and a small trend chip (arrow + code like RPM/EPM/NPM) colored `text-green-600` or `text-destructive` based on `tone`.

**4. Trend chart (Gross vs Overhead · 12-Week Rolling)**
- Wrap in `<Card>` with a proper `<CardHeader>` (title + legend swatches on the right using `bg-primary` / `bg-destructive` dots and `text-muted-foreground` labels).
- Remove all hex colors and drop-shadows. Bind Recharts colors to CSS variables:
  - Revenue stroke/fill: `hsl(var(--primary))`
  - Overhead stroke/fill: `hsl(var(--destructive))`
  - Net (dashed line): `hsl(var(--muted-foreground))`
  - `CartesianGrid` stroke: `hsl(var(--border))`
  - `XAxis` / `YAxis` stroke and tick fill: `hsl(var(--muted-foreground))`, standard sans font, no monospace
  - Tooltip `contentStyle`: `hsl(var(--popover))` background, `hsl(var(--border))` border, `hsl(var(--popover-foreground))` text, standard font, `rounded-md`
  - Cursor: `hsl(var(--muted-foreground))`
- Keep gradient area fills but recolor them via `hsl(var(--primary) / 0.25)` → `/ 0.02` and `hsl(var(--destructive) / 0.25)` → `/ 0.02`.
- Skeleton loading state uses the default `<Skeleton>` (drop the `bg-[#1E2530]` override).
- Empty state: `text-sm text-muted-foreground`, standard font (no `tracking-[0.3em]` "NO DATA").

**5. Typography sweep**
- Remove every `font-mono`, `tracking-[0.2em]`, `tracking-[0.22em]`, `uppercase` micro-label, and hard-coded zinc/emerald/rose color inside this block.
- Currency values render in the app's sans-serif with `tabular-nums` for column alignment.

## Out of scope

- No changes to data hooks (`usePLTrend`, `useOperationalCPM`), calculations, prop shape, or the sections below the command center.
- No changes to other tabs of the Finance page.

## Files touched

- `src/components/finance/PLSummaryTab.tsx` (only the command-center block, lines ~103–334, and the `RatioCell` helper at the bottom).
