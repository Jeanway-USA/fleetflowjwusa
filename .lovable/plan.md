## Goal

Three files, three goals:

1. `src/components/driver/MyPaystubsDialog.tsx` — clean list view, branding only in detail view, realtime purge of deleted/draft rows.
2. `src/components/driver/DriverPayWidget.tsx` — text-only swap of "Paystub*" → "Settlement*" + realtime hook stays.
3. `src/lib/pdf/generateSettlementPdf.ts` — admin-grid hairline tables, top mono tracker, no Accessorials line, mandatory dashed check voucher footer with 45° watermark.

No backend/SQL changes. No changes to pay math, generation, or other callers. Public exports keep their current signatures so nothing else breaks.

## 1. `MyPaystubsDialog.tsx`

Full rewrite, keep the same exported `MyPaystubsDialog` component and `Props` shape so `DriverPayWidget` keeps working.

- **Wording:** every visible string and identifier swept of "Paystub*" — replaced with "Settlement" / "My Settlements" / "Settlement Detail". Local PDF download button keeps calling the shared `generateSettlementPdf(id)` so the wording is irrelevant there.
- **List view (no selection):**
  - Header: `Receipt` icon + `My Settlements`.
  - Single `border border-zinc-200 rounded-none` card containing a vertical stack of rows sorted by `period_end DESC` (most recent on top).
  - **Each row contains only:** date range, status `Badge`, net pay (mono, tabular), `ChevronRight`. Nothing else — no logos, no mono system line, no JEANWAY block.
  - Empty state and loading state unchanged.
- **Detail view (after click):**
  - Back chevron + title `Settlement` + date-range description.
  - This is the *only* place that renders: the `font-mono text-zinc-400` system row (CO/FILE/DEPT/CLOCK/NUMBER), the dark `JEANWAY USA` corporate header block, and the dense bordered grid (Earnings / Reimbursements / Deductions / Net band).
  - Detachable check voucher kept (already present) with the dashed border + 45° watermark.
- **Query + realtime:**
  - Already filters to `status in ('approved','paid')`, which excludes drafts. We additionally chain `.neq('status', 'draft')` to satisfy the explicit requirement and to keep the filter resilient if the `in` list ever changes.
  - Keep `useDriverSettlementsRealtime(driverId, open)` and the `useEffect` that auto-closes the detail view when the selected id disappears from the refetched list — this is what makes a row deleted (or reverted to draft) on the admin side drop instantly.
  - Keep `refetchOnWindowFocus: true`.

## 2. `DriverPayWidget.tsx`

Full rewrite is a near-identical file: the only functional change is making sure no "Paystub" wording remains in code, comments, variable names, button text, or aria labels. The dialog import/usage, realtime hook call, and pay math stay byte-for-byte equivalent.

## 3. `generateSettlementPdf.ts`

Full rewrite of the layout pipeline; signature stays `export async function generateSettlementPdf(settlementId, opts?)`.

- **Top mono tracker line** at `y = 0` margin: `CO: JW    FILE: <id8>    DEPT: DISPATCH    CLOCK: <id8>    NUMBER: 00000000` in `courier` 7.5pt. Corporate dark header banner shifts down below it.
- **All sections rendered via `autoTable` with grid theme:**
  - `theme: 'grid'`, `tableLineColor: [228,228,231]` (zinc-200), `tableLineWidth: 0.4` (hairline).
  - `styles.cellPadding: { top: 4.5, bottom: 4.5, left: 9, right: 9 }` (≈ `py-1.5 px-3`).
  - `alternateRowStyles.fillColor: [248,250,252]` (slate-50/50 zebra).
  - `headStyles.fillColor: [244,244,245]`, `textColor: [82,82,91]`, `fontStyle: 'bold'`, `fontSize: 8`.
  - Sections: Statement Details, Contractor Info, Load Earnings & Routes, Earnings & Additions, Deductions & Escrows, Summary.
- **Accessorials suppression:** before building `earningsBody`, filter `reimbursementItems` with `!/accessorial/i.test(description)` and skip any row whose label resolves to "Accessorial Pay". Summary collapses to exactly four lines: Gross Pay, Total Reimbursements, Total Deductions, Net Pay. Totals continue to use `currentGross / currentReimb / currentDed / currentNet`, so pay math is unchanged.
- **Detachable check voucher** drawn unconditionally at the bottom of the last page (option flag removed):
  - Dashed rectangle stroked with `setLineDashPattern([3,3], 0)` in zinc-300, with a light slate-50 fill (`bg-zinc-50/40` equivalent), `min-height ≈ 110pt`, `padding 4`.
  - Contents (mono, 9pt): Pay To, Pay Date, Voucher #, Bank Routing, Amount, Memo, Authorized Signature line.
  - Watermark: `doc.text('NON-NEGOTIABLE - FOR RECORD PURPOSES ONLY', cx, cy, { angle: 45, align: 'center' })` at 20pt, color `[120,120,130]`, with `setGState(new GState({ opacity: 0.1 }))` then restored to 1.0.

## Verification

- `tsgo` typecheck passes on all three files.
- Open the driver dashboard → `My Settlements` button → confirm:
  - List rows contain only date / badge / net / chevron.
  - Clicking a row reveals the mono tracker + JEANWAY banner + grid + voucher.
- Trigger an admin delete of a settlement (or revert to draft) while the driver dialog is open → row drops within ~1s and the detail auto-closes if it was the open one.
- Generate a PDF, render with `pdftoppm -jpeg -r 150` and visually verify: top mono tracker present, hairline zebra grids, no "Accessorial" line, dashed voucher at base with 45° watermark.

## Out of scope

- `DriverSettlementsTab.tsx` admin cascade delete (already done in prior turn).
- `useDriverSettlementsRealtime` hook (already exists and is reused).
- Supabase migrations, RLS, RPCs.
- Pay math in `payCalculations` / `settlement-pay-breakdown` / `settlement-document-data`.
