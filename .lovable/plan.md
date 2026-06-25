# ADP-Grade Settlement Statement — Deductions + 4-Row Summary

Builds on what shipped last turn. Header stays **JEANWAY LLC / LANDSTAR BCO** (you confirmed Inway agent status isn't live yet — only that label changes when you flip).

## 1. Database migration

Extend `driver_settlement_items` to support deductions, plus aggregate deductions on `driver_settlements`:

```sql
ALTER TABLE public.driver_settlement_items
  DROP CONSTRAINT driver_settlement_items_item_type_check;
ALTER TABLE public.driver_settlement_items
  ADD CONSTRAINT driver_settlement_items_item_type_check
  CHECK (item_type IN ('load_pay','reimbursement','deduction'));

ALTER TABLE public.driver_settlements
  ADD COLUMN deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN ytd_deductions numeric NOT NULL DEFAULT 0;
```

Update `net_pay` generated column (or trigger — confirm in migration) so:
`net_pay = gross_pay + reimbursements − deductions`.

Update `generate_driver_settlements(...)` RPC: initialize `deductions = 0`, fold into the YTD rollup block (sum `deductions` across same-year settlements into `ytd_deductions`).

Update `driver_payroll`-style aggregations only if needed for the Detail Sheet; no other tables touched. No new RLS policies — existing item policies already cover all `item_type`s.

## 2. Net Pay logic (`src/utils/payCalculations.ts`)

Add `totalDeductions` to the breakdown shape. Update `calculateNet`:
`net = gross + reimbursements − deductions`.
Update unit tests in `payCalculations.test.ts` to cover the new branch (one fixture with a deduction line, one without).
Propagate the new field through `src/lib/settlement-pay-breakdown.ts` and `src/lib/settlement-document-data.ts` so YTD payload now carries `{ gross, reimbursements, deductions, net }`.

## 3. Detail Sheet UI — admin deduction editor

`src/components/finance/driver-settlements/SettlementDetailSheet.tsx`

- Split the current single items list into a **dual-column grid** (`grid-cols-1 md:grid-cols-2 gap-6`):
  - **Left — Earnings & Additions**: items where `item_type ∈ {'load_pay','reimbursement'}`.
  - **Right — Deductions & Escrows**: items where `item_type = 'deduction'`. When empty, render the column with a muted "No deductions in this period" placeholder so the grid stays balanced.
- Under the Deductions column, when settlement `status === 'draft'` and viewer has `payroll_admin`/`owner` role, render a lightweight inline editor row: a `<Select>` of preset labels (Escrow, Plate Fee, Insurance, Fuel Advance, IFTA, Other), an `Input` for amount, and an Add button. Submits an `insert` into `driver_settlement_items` with `item_type = 'deduction'`, then invalidates the query. Each deduction row gets a small trash icon (admin-only, draft-only) to delete.
- Recompute the summary block (and the net pay shown at the top) from `gross + reimb − deductions`.

## 4. Printable view — `SettlementPrintable.tsx`

- Keep the `bg-zinc-900` corporate banner (matches your spec; we used `bg-slate-900` last turn — switch to `zinc-900` for consistency with the brief).
- **Itemized Loads table**: keep the full-width loads grid (Date, Load #, Miles, Status, Origin, Destination) with `even:bg-slate-50/50` zebra striping and `print:break-inside-avoid` on each row group.
- **Dual-column block** below the loads table: left card "EARNINGS & ADDITIONS" (load pay rows + reimbursements), right card "DEDUCTIONS & ESCROWS" (deduction rows or empty-state).
- **Dual summary cards** (`grid grid-cols-2`): CURRENT PERIOD vs YEAR-TO-DATE, each rendering 4 rows:
  1. Gross Pay
  2. Total Reimbursements
  3. Total Deductions (shown as negative, red text)
  4. **Net Pay** (bold, highlighted row `bg-slate-50`)
- Under the cards, italic helper: *"Calculation Note: Net Pay = Gross Pay + Reimbursements − Deductions"*.
- Keep existing legal disclosure footer + `Page X of Y` alignment.

## 5. PDF engine — `src/lib/pdf/generateSettlementPdf.ts`

Mirror the printable changes:
- Header banner → zinc-900 hex `#18181B`.
- After the load `autoTable`, render two side-by-side `autoTable`s: Earnings & Additions / Deductions & Escrows. Empty deductions table renders one "No deductions in this period" row so column widths stay symmetric.
- Replace 3-row summary cards with 4-row cards (Gross, Reimb, Deductions, Net). Deductions row uses red text `#DC2626`. Net row uses bold + slate fill.
- Same calculation helper line above the legal footer.
- Filename unchanged: `Settlement_<LastName>_<period_end>.pdf`.

## 6. Out of scope

- No changes to settlement approval/paid flow, no driver-side mutations (drivers stay read-only).
- No new role required — existing `payroll_admin`/`owner` gating reused.
- Corporate header text stays hardcoded; configurable subtitle deferred.

## Technical summary

| File | Change |
|---|---|
| `supabase/migrations/<ts>_settlement_deductions.sql` | New `deduction` item type, `deductions` + `ytd_deductions` columns, net_pay recompute, RPC update |
| `src/utils/payCalculations.ts` (+ test) | Add deductions to breakdown + net formula |
| `src/lib/settlement-pay-breakdown.ts` | Surface `totalDeductions` |
| `src/lib/settlement-document-data.ts` | Include deductions in current + YTD payload |
| `src/components/finance/driver-settlements/SettlementDetailSheet.tsx` | Dual-column items grid + admin deduction editor |
| `src/components/finance/driver-settlements/SettlementPrintable.tsx` | zinc-900 banner, zebra loads table, dual-column block, 4-row dual summary cards |
| `src/lib/pdf/generateSettlementPdf.ts` | Mirror printable: dual tables + 4-row cards |
