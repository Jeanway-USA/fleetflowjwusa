## Pay-type-aware breakdown in Settlements UI + PDF

Render an "Earnings Breakdown" that adapts to the driver's `pay_type`, in both the Driver Settlements table (detail sheet/expanded row) and the official PDF. Reimbursements continue to roll into Net Pay for all types.

### Detection

Pull `drivers.pay_type` and `drivers.pay_rate` alongside the settlement (already fetched in PDF). Normalize `cpm → per_mile`. Decide layout from the type.

### What each variant shows

**Flat Rate**
- Single "Base Pay" line: label `Flat Rate Base Pay`, amount = driver's `pay_rate`.
- Below it, an informational "Loads Worked This Period" mini-table (Date · Load # · Origin → Destination · Status) so reviewers see the activity behind the flat fee. No per-load amount column.

**CPM (per_mile)**
- "Pay Calculation" summary row: `Loaded Miles  ×  Rate Per Mile  =  Base Pay`
  - e.g. `1,842 mi × $0.65/mi = $1,197.30`
- Full "Load Earnings" table: Date · Load # · Origin → Destination · Loaded Miles · Amount, with a footer row totaling Loaded Miles and Base Pay.

**Percentage**
- "Pay Calculation" summary row: `Gross After Truck Split (65%)  ×  Driver %  =  Base Pay`
  - e.g. `$4,500.00 × 25% = $1,125.00`
- Full "Load Earnings" table: Date · Load # · Origin → Destination · Linehaul · After 65% Split · Driver Share, footer totals each numeric column.

All three variants then show the existing "Reimbursements" table and the existing "Current Period / YTD" summary blocks. Net Pay (gross + reimbursements) stays the headline number on both surfaces.

### PDF polish (official-looking)

- Add a small "EARNINGS METHOD" chip in the period strip showing `Flat Rate`, `Cost Per Mile @ $X.XX/mi`, or `Percentage @ X%` so the calculation context is visible at a glance.
- Right-align the formula in a thin bordered "Pay Calculation" band above the load table.
- Light footer rule reading: `Net Pay = Gross Pay + Reimbursements` under the Current Period block, reinforcing the math for proof-of-income reviewers.
- Keep slate-900 header band, conservative typography, page numbers, and tax/contractor note already in place.

### Files touched

- `src/lib/pdf/generateSettlementPdf.ts` — branch the Earnings section by pay type, add the calculation band, add method chip. Reuses existing data fetch (already pulls `pay_type`; add `pay_rate`).
- `src/components/finance/driver-settlements/SettlementDetailSheet.tsx` — add an "Earnings Breakdown" card above the existing reimbursement section that mirrors the PDF layout (formula line + load table variant by pay type). Pulls driver `pay_type`/`pay_rate` (extend the existing driver query).
- `src/components/finance/driver-settlements/DriverSettlementsTab.tsx` — no structural change; the existing row already shows Gross / Reimbursements / Net. Add a small subtitle under the Gross Pay cell showing the method (`Flat`, `$0.65/mi × 1,842 mi`, `25% of $4,500`) so the table communicates the calculation at a glance.

### Data needs

- Driver: `pay_type`, `pay_rate` (already mostly fetched).
- Loads: already fetched (`booked_miles`, `actual_miles`, `rate`, `delivery_date`, origin/destination, landstar id). For flat drivers we need in-transit loads too — query `fleet_loads` by `driver_id` in `[period_start, period_end]` with status in (`delivered`,`in_transit`) instead of relying on settlement line items.
- Truck split: read `company_settings.truck_percentage` (same lookup the RPC uses) so the percentage formula shows the same 65% the back-end applied.

### Out of scope

- No schema changes. No changes to `generate_driver_settlements` (already pay-type aware).
- No changes to reimbursement add/delete flow.

### Verification

- Typecheck with `tsgo`.
- Render PDFs for one flat, one CPM, one percentage settlement against the live preview, convert to images with `pdftoppm`, and visually QA: no overlapping text, formula band fits, tables not clipped, footer present on every page.
