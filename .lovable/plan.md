# PLSummaryTab — Bloomberg Terminal Executive Command Center

Refactor `src/components/finance/PLSummaryTab.tsx` only. Data hooks (`useOperationalCPM`, `usePLTrend`) and props stay as-is — this is a pure presentation pass anchored on the locked tokens.

## Locked tokens

- **Palette**: bg `#0A0E14`, surface `#11151C`, elevated `#1E2530`, hairline `#1E2530`, text `#E5E7EB`, muted `#6B7280`, gain `#22C55E`, loss `#EF4444`, warn `#F59E0B`.
- **Type**: JetBrains Mono for every number, label, axis tick, and ticker chip; Inter for prose / card titles.
- **Layout**: Dense Dashboard — top KPI row, ratios mini-tape below, wide chart band beneath, no marketing chrome.

Font wiring: `bun add @fontsource/jetbrains-mono @fontsource/inter`, import both in `src/main.tsx`, register `font-mono: 'JetBrains Mono'` and `font-sans: 'Inter'` in `tailwind.config.ts`. Skip if already present.

## Component structure

```text
+------------------------------------------------------------------+
| Ticker strip — mono, muted: "FLEET P&L · LIVE · <generated_at>"  |
+------------------------------------------------------------------+
| KPI 1: GROSS REVENUE | KPI 2: DISPATCHED EXP | KPI 3: NET MARGIN |
|  green accent rail   |  plain                |  bold highlight   |
+------------------------------------------------------------------+
| CPM RATIOS TAPE                       [ WEEK | MONTH | QUARTER ] |
|  RPM   $ x.xx   |   EPM   $ x.xx   |   NPM   $ x.xx             |
+------------------------------------------------------------------+
| TREND — Gross Revenue vs Overhead Expense · 12-week rolling      |
| <area chart, green over red, mono axes>                          |
+------------------------------------------------------------------+
```

### 1. Top KPI row

Three flex-equal cards in `grid grid-cols-1 md:grid-cols-3 gap-3`. Card chrome:

- `bg-[#11151C] border border-[#1E2530] rounded-sm p-5 relative`
- Eyebrow: `font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500`
- Value: `font-mono text-4xl tabular-nums text-zinc-100`
- Delta chip: `font-mono text-[11px]` with `text-emerald-400` / `text-rose-400`
- Sparkline (12-week, from `usePLTrend` series): 28px tall, no axes, color matches metric sign.

Per-card emphasis:

- **Card 1 — Fleet Gross Revenue**: 3px left rail `bg-emerald-500` via `before:` pseudo (`before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-emerald-500`).
- **Card 2 — Total Dispatched Expenses**: plain card, value `text-zinc-200`. Sums `loadExpenseTotals + standaloneExpenseTotals + payrollTotals + commissionTotals` (already on props).
- **Card 3 — Net Operating Margin**: highlighted — `bg-gradient-to-br from-[#11151C] to-[#1E2530]` + `ring-1 ring-emerald-500/40` when `netProfit >= 0`, `ring-rose-500/40` otherwise. Value rendered larger (`text-5xl`) and colored by sign. Sub-line: profit margin % in mono.

### 2. CPM ratios tape

Single card under KPI row: `bg-[#11151C] border border-[#1E2530] rounded-sm`. Header row holds the title `OPERATIONAL RATIOS · PER MILE` (mono eyebrow) on the left and the timeframe `ToggleGroup` on the right styled as a segmented mono pill:

- Container: `bg-[#0A0E14] border border-[#1E2530] rounded-sm p-0.5`
- Items: `font-mono text-[11px] uppercase tracking-wider px-3 py-1 data-[state=on]:bg-[#1E2530] data-[state=on]:text-emerald-400`

Body: 3 columns separated by 1px vertical hairlines.

- **RPM** — revenue / miles, label "REV / MILE", value mono `text-2xl`, secondary line shows raw totals "$X over Y mi".
- **EPM** — expense / miles, label "EXP / MILE", rose-tinted.
- **NPM** — net / miles, label "NET / MILE", green/rose by sign.

Source: `useOperationalCPM(timeframe)` — already wired.

### 3. Trend band (12-week)

Card: `bg-[#11151C] border border-[#1E2530] rounded-sm p-5`.
Header: mono eyebrow `TREND · GROSS vs OVERHEAD · 12-WEEK ROLLING`, right-side legend with two mono swatches (green square + red square).

Recharts `ComposedChart` with `data` from `usePLTrend(12)`:

- `<CartesianGrid stroke="#1E2530" vertical={false} />`
- `<XAxis dataKey="weekLabel" stroke="#6B7280" tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />`
- `<YAxis stroke="#6B7280" tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} tickFormatter={abbrevCurrency} />`
- Two `<Area>` layers: expense (`#EF4444`, fillOpacity 0.18) underneath, revenue (`#22C55E`, fillOpacity 0.22) on top; both `strokeWidth={1.5}`, `type="monotone"`.
- Tooltip: dark surface `#0A0E14`, mono font, formatted via `formatCurrency`.
- Height: `h-[320px]`.

### 4. Ticker strip

Thin top bar above KPI row: `font-mono text-[10px] tracking-[0.18em] text-zinc-500 border-b border-[#1E2530] px-1 py-2` reading `FLEET P&L · LIVE · UPDATED ${time}` left-aligned, period label right-aligned. Pure chrome — no data dependency beyond `new Date()`.

## Loading + empty

Reuse existing `Skeleton` blocks but restyle to `bg-[#1E2530]`. Empty trend renders the chart frame with a centered mono "NO DATA" label.

## Out of scope

- No prop changes; parent in `src/pages/Finance.tsx` keeps its existing call site.
- No data-fetching changes; keep `useOperationalCPM` + `usePLTrend` exactly as-is.
- No new routes, no new tabs.
- Don't touch other Finance tabs.

## Verification

- `tsgo` typecheck.
- Playwright capture of `/finance` → P&L tab at 1280×1800; confirm: dark bg, mono numerals, green rail on Card 1, highlighted Net Margin card, segmented timeframe toggle, 12-week chart with green-over-red areas.
