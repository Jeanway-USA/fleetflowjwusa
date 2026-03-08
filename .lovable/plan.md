

## Plan: Generate EOW Report — Printable Executive Summary

### 1. Create `PrintableExecutiveSummary` Component

**File: `src/components/executive/PrintableExecutiveSummary.tsx`**

A print-optimized, black-and-white summary that receives the already-fetched dashboard data as props (no extra queries needed).

**Props:** `kpiData`, `fleetStatus`, `driverAvailability`, `topPerformers`, `operationalData`, `period`

**Layout (forced light theme via inline styles / `print:` utilities):**
- White background, black text, no dark mode classes
- Company header with date range and generation timestamp
- **Section 1 — Revenue KPIs**: 4-column grid showing Gross Revenue, Net Revenue, Operating Profit, Margin with period-over-period change
- **Section 2 — Fleet Status**: Simple table row — Hauling / Available / Maintenance / OOS counts
- **Section 3 — Driver Availability**: Table row — On Load / Available / Off Duty / Credential Issues
- **Section 4 — Operational Metrics**: Total Loads, Total Miles, Rev/Mile, Fleet Utilization, Empty Miles %
- **Section 5 — Top Performers**: Driver name + stats, Truck unit + stats
- Footer: "Generated via FleetFlow" + timestamp
- A "Print Report" button (`window.print()`) and "Close" button at the top — hidden via `print:hidden`

### 2. Add Print Styles

Add a `@media print` block to `src/index.css`:
- Hide everything except the printable summary (using a `print-report` class on the modal content)
- Force white background, black text
- Remove shadows, borders become thin gray lines

### 3. Wire into ExecutiveDashboard

**File: `src/pages/ExecutiveDashboard.tsx`**

- Add `showReport` state
- Add "Generate EOW Report" button (outline variant, `FileText` icon) next to the `PeriodSelector`
- Render `PrintableExecutiveSummary` inside a full-screen `Dialog` (using existing dialog component with `className="max-w-4xl h-[90vh] overflow-auto"`)
- Pass all existing data variables as props — no new queries

### Files

| File | Action |
|---|---|
| `src/components/executive/PrintableExecutiveSummary.tsx` | Create — print-optimized report |
| `src/index.css` | Edit — add `@media print` rules |
| `src/pages/ExecutiveDashboard.tsx` | Edit — add button + dialog |

