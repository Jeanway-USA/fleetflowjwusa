## Driver Settlements UI Refactor

Scope: `src/components/driver/MyPaystubsDialog.tsx` and `src/components/driver/DriverPayWidget.tsx`. Presentation-only changes — no data, query, or pay-math edits.

### 1. Terminology: "Paystub(s)" → "Settlement(s)"

Rename all user-visible strings only (keep file names, prop names, query keys, PDF internal labels untouched to avoid churn):

- `DriverPayWidget.tsx`
  - Button label: `My Paystubs` → `My Settlements`
- `MyPaystubsDialog.tsx`
  - List `DialogTitle`: `My Paystubs` → `My Settlements`
  - List `DialogDescription`: "Approved and paid paystubs for your records." → "Approved and paid settlements for your records."
  - Detail `DialogTitle`: `Paystub` → `Settlement`
  - Empty state: "No paystubs yet." → "No settlements yet."

### 2. Fix list nesting — remove branding from history view

In `MyPaystubsDialog.tsx`, the list-view branch currently renders `<CorporateHeader />` above the row container. Remove it from the list branch entirely so the history screen is a clean stack.

List row spec (unchanged data, tightened presentation):
- Sort: already `order('period_end', { ascending: false })` — keep (most recent on top).
- Each row shows only:
  - Date range (`fmtPeriod`)
  - Status `Badge` (compact)
  - Net pay (`font-mono tabular-nums`, right-aligned)
  - `ChevronRight` indicator
- Keep zebra striping and hover; drop any secondary metadata.

### 3. Move corporate header into detail view only

`<CorporateHeader />` (the `CO: JW … NUMBER:` mono metadata strip + the dark `JEANWAY USA / LANDSTAR INWAY, INC. AGENT / address` banner) renders exclusively inside the detail branch, above the "PAID TO / status / PDF" row and the earnings grid. It already lives there — just ensure it is removed from the list branch (step 2) so it appears uniquely in the detail screen.

### Out of scope
- No changes to queries, pay math, accessorial omission, voucher footer, or PDF generator.
- No changes to admin-side components.

### Verification
- `tsgo` typecheck.
- Playwright at 1280×1800 against `/driver-view/...`: open "My Settlements", confirm list screen has no JEANWAY banner and shows compact rows; click a row and confirm the JEANWAY header + mono metadata appear above the earnings grid.
