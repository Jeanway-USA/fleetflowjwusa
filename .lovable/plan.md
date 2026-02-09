

# IFTA Page Enhancements: Reset, Tooltips, and Printable Filing Summary

## Overview

Three additions to the IFTA Reporting page:

1. **Reset Quarter Data** -- A "Reset" button that clears all IFTA records and/or fuel purchases for the selected quarter so the user can start fresh.
2. **IFTA Terminology Tooltips** -- Informational tooltips on key terms like "Taxable Miles," "Tax Credit," "Net Position," "Fleet MPG," and more, explaining what they mean in plain language.
3. **Printable IFTA Filing Summary** -- A dedicated view formatted to match the standard IFTA quarterly return layout, optimized for printing or PDF export via the browser's print function.

---

## 1. Reset Quarter Data

### What It Does
Adds a "Reset Quarter" button to the page header area (next to the quarter/truck filters). Clicking it opens a confirmation dialog letting the user choose what to clear:
- **IFTA Records** (the generated mileage/tax report for the quarter)
- **Fuel Purchases** (synced and manually-added fuel data for the quarter)
- **Both** (start completely fresh)

### Implementation
- Add a "Reset Quarter" button with a destructive/outline style and a trash/refresh icon
- Use the existing `ConfirmDeleteDialog` pattern (AlertDialog) for confirmation
- On confirm, delete the selected data:
  - IFTA records: `DELETE FROM ifta_records WHERE quarter = selectedQuarter`
  - Fuel purchases: filter by date range matching the quarter, delete matching rows
- Invalidate queries after deletion so the UI refreshes
- Show a success toast confirming what was cleared
- The workflow stepper will automatically update (steps revert to incomplete)

---

## 2. IFTA Terminology Tooltips

### What It Does
Adds small info-circle icons next to IFTA-specific terms throughout the page. Hovering (or tapping on mobile) shows a plain-language explanation.

### Terms to Annotate

| Term | Location | Tooltip Text |
|------|----------|-------------|
| Taxable Miles | IFTA Report table header | "Miles driven on public roads that are subject to IFTA fuel tax. Usually equals total miles unless exempt miles apply." |
| Tax Rate | IFTA Report + Jurisdiction Summary headers | "The per-gallon diesel fuel tax rate set by each state. Rates vary by jurisdiction and may change quarterly." |
| Tax Credit | Jurisdiction Summary header | "Credit for fuel taxes already paid at the pump in this state. The more fuel you buy in a state, the higher your credit." |
| Net Position | Jurisdiction Summary header | "The difference between tax owed and tax credit. Red means you owe additional tax; green means you overpaid and get a credit." |
| Tax Liability | Summary card | "Your total net tax position across all jurisdictions. This is the amount you owe (or are owed) for the quarter." |
| Fleet MPG | (add to summary or report) | "Fleet miles per gallon -- total miles driven divided by total gallons purchased. Used to calculate how many gallons were consumed in each state." |
| Gal Consumed | Jurisdiction Summary header | "Estimated gallons of fuel used in this state, calculated by dividing miles driven by your fleet MPG." |
| Gal Purchased | Jurisdiction Summary header | "Actual gallons of fuel bought at stations in this state, as recorded in your fuel purchases." |

### Implementation
- Use the existing `Tooltip`, `TooltipTrigger`, `TooltipContent`, and `TooltipProvider` components from `@/components/ui/tooltip`
- Wrap a small `HelpCircle` (from lucide-react) icon next to each term
- Keep tooltip text concise (1-2 sentences max)
- Apply to headers in: IFTA Report table, Jurisdiction Summary table, and summary cards
- Add a `TooltipProvider` wrapper at the page level if not already present

---

## 3. Printable IFTA Filing Summary

### What It Does
Adds a "Print Filing Summary" button that opens a clean, print-optimized view of the IFTA quarterly return data. This view:
- Matches the standard IFTA quarterly return layout with carrier info header, reporting period, and jurisdiction breakdown
- Includes all the key fields: jurisdiction, total miles, taxable miles, tax rate, gallons consumed, gallons purchased, tax owed, tax credit, net tax
- Has a totals row at the bottom
- Is styled for clean printing (no sidebar, no navigation, minimal color, good borders)
- Uses the browser's native `window.print()` for PDF export

### Implementation
- Create a new component `src/components/ifta/IFTAPrintSummary.tsx`
- This component renders as a dialog/sheet containing the formatted return
- Layout includes:
  - Header: "IFTA Quarterly Fuel Tax Return" with quarter, date generated
  - Carrier section: company name placeholder, license number placeholder (can be filled in by user)
  - Main table: jurisdiction data in the standard IFTA column order
  - Totals row
  - Footer: signature/date line for paper filing
- Add print-specific CSS using `@media print` to hide everything except the summary content
- Add a "Print / Save PDF" button inside the view that triggers `window.print()`
- The button to open this view goes in the IFTA Report tab header (next to "Export CSV")

---

## Technical Details

### Files to Create
- `src/components/ifta/IFTAPrintSummary.tsx` -- Printable IFTA quarterly return component

### Files to Modify
- `src/pages/IFTA.tsx` -- Add reset button + confirmation dialog, add tooltips throughout, add print summary button
- `src/components/ifta/JurisdictionMap.tsx` -- Add tooltips to the Jurisdiction Summary table headers

### No Database Changes Needed
All operations use existing delete queries. No schema changes required.

### Key Decisions
- The reset confirmation uses the existing AlertDialog pattern for consistency
- Tooltips use the already-installed Radix Tooltip components (no new dependencies)
- The print view uses `@media print` CSS + `window.print()` rather than a third-party PDF library, keeping it simple and dependency-free
- The print layout uses a Dialog so it can be previewed on screen before printing

