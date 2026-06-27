## My Settlements — full-page 3-column dashboard for 1099 owner-operators

Replaces the cramped "My Paystubs" modal with a dedicated route, premium fintech layout, and proper truck-driver terminology.

### Task 1 — Routing & navigation

- **Remove** the visible "My Paystubs" button + its `MyPaystubsDialog` lazy-load in `src/components/driver/WeeklyPerformanceWidget.tsx`. Replace it with a subtle `<Link to="/driver/settlements">View Settlements →</Link>` button so the entry point doesn't disappear.
- Clean up the unused `MyPaystubsDialog` import in `src/components/driver/DriverPayWidget.tsx`.
- Leave `MyPaystubsDialog.tsx` on disk for now (still imported by other tools) — only the driver-dashboard button is removed.
- Add a new route in `src/App.tsx`: `/driver/settlements` → `<DriverSettlements />`, guarded by the existing `driver` role `ProtectedRoute`.
- In `src/components/layout/AppSidebar.tsx`, insert a new driver-only menu item between "My Loads" and "My Stats":
  - Title: **My Settlements**, icon: `Receipt` from lucide, path: `/driver/settlements`.
- Create `src/pages/DriverSettlements.tsx` as the page entry, plus child components under `src/components/driver/settlements/`.

### Task 2 — Left column: Settlement History

`SettlementHistoryList.tsx`

- Scrollable list, fixed width (`w-80`), sticky on `lg` screens.
- Query: `driver_settlements` for the signed-in driver, ordered `period_end desc`, joined to settlement totals already on the row.
- For each row show:
  - **Period end date** (large, e.g. `Jun 22, 2026`) and small period range underneath.
  - **Total Miles** (replaces "Hours") — sum of `booked_miles` from `fleet_loads` in the settlement period (driver delivered loads), fetched in one batched RPC-style query via `buildSettlementDocumentData`-style helper, OR derived in a `useSettlementMiles(settlementIds)` hook that runs a single grouped query.
  - **Gross Revenue** = `gross_pay`.
  - **Net Settlement** = `net_pay` (fallback `gross_pay - deductions + reimbursements + escrow_credited_amount`).
  - Status pill (`paid`, `approved`, `draft`).
- Selected row highlighted with `bg-primary/10 border-l-2 border-primary`. Default selection = most recent.

### Task 3 — Center column: visuals & breakdown

`SettlementDetailPanel.tsx`

- **Top bar**: settlement period (`MMM d – MMM d, yyyy`), status badge, prominent `Download PDF` button (calls existing `generateSettlementPdf(selected.id)`).
- **Hero number**: "Net Settlement" as the page's largest element — `text-5xl lg:text-6xl font-bold tracking-tight`, currency-formatted, in `text-foreground` with a small "Take-Home Pay" caption above.
- **Donut chart** (recharts `PieChart` + `Pie` with `innerRadius=70 outerRadius=110`, center label = Gross Revenue):
  - Slices (semantic tokens, not hardcoded hex):
    - **Net Settlement** — `hsl(var(--success))` (green)
    - **Brokerage/Agency Split** — `hsl(var(--primary))` (blue/brand)
    - **Fuel Advances** — `hsl(var(--destructive))` (red)
    - **Deductions/Escrow** — `hsl(var(--accent))` (purple/secondary token)
  - Legend below with $ + % per slice.
  - Source: `driver_settlement_items` (`item_type` filter: `deduction` + description heuristics for fuel/escrow/agency), with `gross_pay` total as the chart total.
- **Accordions** (`@/components/ui/accordion`, three sections, allow multi-open):
  1. **Revenue** — Booked Linehaul, 100% Fuel Surcharge (FSC), Detention / Lumpers / Accessorials (rows pulled from `fleet_loads` + `load_accessorials` joined for the period via existing `settlement-pay-breakdown` helpers — already implemented).
  2. **Deductions** — Fuel Card Advances, Trailer Rental, Escrow, Insurance (Bobtail / OccAcc). Itemized from `driver_settlement_items` where `item_type='deduction'`, bucketed by description keyword.
  3. **Totals** — Gross Revenue, Total Deductions, Final Net Settlement (bold).

### Task 4 — Right column: Tax & YTD

`TaxAndYtdPanel.tsx`

- **1099 Tax Statements card**:
  - `Select` dropdown of tax years derived from `min(period_start)…current year` for that driver.
  - "Download 1099-NEC (PDF)" button. For now wired to a placeholder toast — actual generator will hook in later; the button just dispatches the year so we don't ship dead UI.
  - Note line: "1099-NEC forms are issued each January for the prior tax year. Contact dispatch if you need a correction."
- **YTD Snapshot card** (current calendar year):
  - **YTD Gross Revenue** — `sum(gross_pay)`.
  - **YTD Loaded Miles** — sum of delivered `fleet_loads.booked_miles` for the driver year-to-date.
  - **YTD Net Pay** — `sum(net_pay)`.
  - Small "as of {today}" timestamp, refetch on settlement realtime channel (`useDriverSettlementsRealtime` already exists).

### Task 5 — UI aesthetics

- Page header: `My Settlements` (`text-3xl font-semibold tracking-tight`) + subtitle "1099 Owner-Operator Pay Statements".
- 3-column layout: `grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)_22rem] gap-6`. Stacks vertically on mobile (history collapses to a horizontally-scrollable strip on `<lg`).
- All colors via semantic tokens (`bg-card`, `text-card-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, etc.) — no `text-white`/`bg-black`/hex literals.
- Cards use existing `card-elevated` utility for the premium fintech feel.
- Typography: section labels `text-xs uppercase tracking-wider text-muted-foreground`; numbers tabular-nums.
- Hero net-settlement number dominates visually — every other amount on the page is smaller.

### Technical notes

- New folder: `src/components/driver/settlements/`
  - `SettlementHistoryList.tsx`
  - `SettlementDetailPanel.tsx`
  - `SettlementDonutChart.tsx`
  - `SettlementAccordions.tsx`
  - `TaxAndYtdPanel.tsx`
- New page: `src/pages/DriverSettlements.tsx`
- New hook: `src/hooks/useDriverSettlementsPage.ts` — wraps:
  - `driver_settlements` list query
  - `driver_settlement_items` for selected
  - `fleet_loads` joined for period (delivered + driver_id + date range) to compute total miles and revenue line items
  - YTD aggregates (single query: `gte('period_start', start-of-year)`)
- Reuses existing `generateSettlementPdf` for downloads.
- Reuses existing `useDriverSettlementsRealtime` so list + YTD refresh when a new settlement is generated/approved.

### Out of scope

- No DB schema changes, no RLS edits — `driver_settlements` policies already allow drivers to read their own rows.
- Actual 1099-NEC PDF generator (button stubbed with a toast pointing at the future generator).
- Old `MyPaystubsDialog.tsx` file stays so other surfaces that still reference it keep working; only the driver-dashboard entry point switches to the new page.