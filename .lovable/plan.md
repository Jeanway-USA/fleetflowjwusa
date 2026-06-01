# Driver-facing "My Paystubs"

Add a paystubs viewer for drivers, sourced from the new `driver_settlements` table (the unified Driver Settlements model from the previous turn — not the legacy `settlements` table).

## New component

`src/components/driver/MyPaystubsDialog.tsx`

- Default-exports a single dialog with two states: list view + detail view.
- Props: `driverId: string`, `payType: string | null`, `payRate: number | null`, trigger via `open` / `onOpenChange` controlled from parent.

### List view
- Query `driver_settlements` filtered by `driver_id = driverId` and `status in ('approved', 'paid')`. Excludes `draft`.
- Sort by `period_end DESC`.
- Each row: period range (`MMM d – MMM d, yyyy`), status badge (Approved / Paid), and net pay amount (right-aligned, primary color). Whole row clickable → opens detail.
- Empty state: "No paystubs yet."

### Detail view
- Header: "Paystub" + period range, back button to return to list.
- Card with positive-only earnings layout:
  - **Base Pay** — labeled "Flat Rate Guarantee" when `payType === 'flat'`, otherwise "Load Earnings". Show amount.
  - **Bonuses** — single line `Bonus Pay` (only render if `> 0`). Subtitle: "Safety / Performance".
  - Divider.
  - **Net Pay** — large primary amount.
- No deductions row. No negative numbers anywhere. The `deductions` column from DB is intentionally ignored in the UI.
- "Download PDF" button (top-right of detail card).
  - Uses `jspdf` directly (no html2canvas) to render a clean, vector paystub: company-style header, driver name, period, line items, net pay total, generated-on timestamp.
  - Filename: `paystub-{period_start}-to-{period_end}.pdf`.

### Data fetched once
- Driver name + company name fetched alongside settlements (single query joining `drivers` for name; org/company name from `company_settings` via existing helper if cheap, otherwise just driver name + "Driver Paystub" title).

## Entry point

`src/components/driver/DriverPayWidget.tsx`
- Add a small ghost button in the card header: `<Receipt /> My Paystubs` that opens the dialog.
- No other changes to the widget's existing weekly-pay calculation logic.

## Out of scope

- Editing or contesting paystubs from the driver side.
- Email delivery of the PDF.
- Showing draft paystubs.
- Touching `WeeklyPerformanceWidget.tsx` — the entry point lives in `DriverPayWidget` which is the actual pay-focused widget (no `WeeklyPayWidget.tsx` exists).
