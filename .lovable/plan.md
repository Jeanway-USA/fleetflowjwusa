## Fleet Loads – Header + KPI Redesign

Scope: presentational overhaul of the top of `src/pages/FleetLoads.tsx` only. No data model, query, or business-logic changes.

### 1. Page Header
Replace the current `<PageHeader title="Fleet Loads" description="Track loads, revenue, and settlements" ... />` block with a custom header section:

- Bold, dark title "Fleet Loads" (`text-3xl font-bold tracking-tight text-foreground`).
- Muted sub-text showing current status/timeframe, derived from `selectedMonth`:
  - `"all"` → "Showing all loads · {totals.loads} total"
  - specific month → "Showing {Month YYYY} · {totals.loads} loads"
- Right side keeps the existing "Add Load" primary button and `NotificationCenter` (reused from `PageHeader` styling so nav actions stay consistent).

### 2. KPI Summary Grid
Replace the existing 4-card grid (lines ~798–842) with a new 3-card grid:

```text
grid grid-cols-1 md:grid-cols-3 gap-6 mb-6
```

Cards (values computed from the already-available `loads` array; no new queries):

1. **Total Gross Income** — sum of `grossRevenue` across filtered loads (reuse `totals.grossRevenue`). Icon: `DollarSign` in an emerald tint (`bg-emerald-500/10 text-emerald-600`).
2. **Pending Income (In Transit)** — sum of gross revenue for loads whose `status` is in `['in_transit','dispatched','at_pickup','at_delivery']` (non-delivered/non-cancelled). Icon: `Truck` in an amber tint (`bg-amber-500/10 text-amber-600`).
3. **Completed Loads** — count of loads with `status === 'delivered'`. Icon: `CheckCircle2` in a blue tint (`bg-blue-500/10 text-blue-600`).

Each card:
- `bg-card` (semantic white in light, dark surface in dark mode — avoids hardcoded `bg-white` per design system rules), `shadow-sm`, `rounded-xl`, `border border-border/60`, `p-6`.
- Layout: metric label (`text-sm font-medium text-muted-foreground`) on top-left, value below in `text-2xl font-bold`, optional secondary line (`text-xs text-muted-foreground`, e.g., "$/mile" for gross, load count for pending).
- Icon in top-right inside a `h-10 w-10 rounded-full flex items-center justify-center` tinted circle.

### 3. What stays the same
- Rate confirmation uploader, search + month filter, DataTable, dialogs, and all mutations are untouched.
- Driver-only branch (`isDriverOnly`) is untouched.

### Technical notes
- New KPI totals are computed inline alongside the existing `totals` memo (no new hooks).
- Uses semantic tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) plus tint utilities on icon backgrounds only — safe in both themes.
- Only `src/pages/FleetLoads.tsx` is edited.
