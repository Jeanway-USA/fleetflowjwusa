## Problem

Tax forms collect the data but only the W-4 is actually consumed by the payroll engine. The State-Tax and I-9 forms just sit in their tables, and Tax Hub W-2 generation ignores the employee address (I-9). Result: SIT is a flat `gross × state_rate` for every W-2 driver regardless of what they signed, and W-2 PDFs go out without an employee address.

Current coverage audit:
- **W-4** (`driver_w4_info`) — used ✅ (`ActiveBatchTab` → `calculateFitPub15T`)
- **W-9** (`driver_w9_info`) — used ✅ (`get_1099_totals` pulls legal_name / address / TIN)
- **I-9** (`driver_i9_info`) — collected, **never read** ❌ (employee address for W-2 missing)
- **State Tax** (`driver_state_tax_info`) — collected, **never read** ❌ (`exempt`, `filing_status`, `allowances`, `additional_withholding` all ignored)
- **Banking** — used by check voucher ✅

## Plan

### 1. Use state-tax form data in payroll calc
`src/utils/payCalculations.ts`, `src/components/finance/inhouse-payroll/ActiveBatchTab.tsx`

Extend `W2PayrollInput` with an optional `stateW4` snapshot:
```ts
stateW4?: {
  exempt: boolean;
  filing_status: FilingStatus;
  allowances: number;
  additional_withholding: number;
}
```

Update `calculateW2Payroll` SIT branch to:
- Return `0` when `stateW4.exempt === true`.
- Compute annualized taxable = `gross × periods − allowances × ALLOWANCE_VALUE` (fallback constant, e.g. `$2,000`, since we don't yet have per-state allowance tables — documented as approximation until state tables land).
- `sitPeriod = max(0, annualTaxable × state.sit_rate) / periods + additional_withholding`.
- Non-exempt drivers with no state-tax form fall back to today's flat-rate behavior (no regression).

`ActiveBatchTab.tsx`:
- Add `driver_state_tax_info` query keyed by `orgId`, build a `stateW4Map`, pass into `calculateW2Payroll`.
- Persist the `additional_withholding` and `exempt` snapshot onto `tax_withholding_ledger` so the audit trail keeps them.

### 2. W-2 PDF: include I-9 employee address
`src/pages/admin/TaxHub.tsx` → `W2Tab.generate`

- After fetching `ssnFull`, also fetch the driver's I-9 row (`address`, `full_name`) via a new lightweight query.
- Pass `driver.address` and (if present) `driver.legalName` into `generateW2Pdf` — the PDF already accepts `address` (line 10 of `generateW2Pdf.ts`).

### 3. Missing-form warnings in Active Batch
`ActiveBatchTab.tsx`

- In the driver row summary, show a small amber badge when any of these are missing for a W-2 driver:
  - No `driver_w4_info` row → "W-4 missing (using single/0)"
  - No `driver_state_tax_info` row → "State tax form missing"
  - No `driver_i9_info` row → "I-9 missing"
- Non-blocking; batch can still generate but admin knows why numbers may be off.

### 4. Tax Hub W-2 tab: surface I-9 completeness
`useTaxHubData.ts` / `get_w2_totals` migration

Add three joined flags to `get_w2_totals` return: `has_w4 boolean`, `has_state_tax boolean`, `has_i9 boolean` (LEFT JOIN + `x.id IS NOT NULL`). W-2 tab shows a warning row when any driver has `has_i9 = false` before generating PDFs.

### 5. Verification
- W-2 driver marked `exempt` in state-tax form → payroll batch shows `SIT = 0`, ledger reflects it, W-2 Box 17 rolls up to $0.
- Same driver with `additional_withholding = 25` → each period's SIT = base + 25.
- Generate a W-2 PDF for a driver who has an I-9 → address prints in the "Employee name and address" block.
- Driver with no state-tax form → current flat-rate behavior preserved and amber "State tax form missing" badge appears.

## Technical notes

- Non-schema-changing: no new tables. Only migration is `get_w2_totals` re-created with 3 completeness booleans and its existing GRANT reissued.
- Allowance dollar amount is intentionally a constant fallback; a follow-up plan can pull per-state allowance tables from `state_tax_configurations` when we're ready to model them properly.
- `driver_state_tax_info` already exposes `filing_status` — we accept the value but the current state SIT model is a single rate per state, so filing_status is stored/audited but not yet branched on. Note added inline in the code.
- No RLS changes: I-9 / W-4 / W-9 / state-tax reads are already scoped to `has_payroll_access` which owner + payroll_admin satisfy.
