# Employment-type-aware pay engine

Refactors the single source of truth (`src/utils/payCalculations.ts`) and the settlement total recalc DB function to branch on `drivers.employment_type`. All existing callers keep working — `employment_type` is optional and defaults to today's behavior.

## 1. `src/utils/payCalculations.ts` — formula routing

Extend `PayDriver`:

```ts
employment_type?: 'w2_company' | '1099_contractor' | 'lease_purchase' | null;
```

Add a new shared type and helper:

```ts
export type EmploymentClass = 'w2' | 'contractor';

export function classifyEmployment(d?: PayDriver | null): EmploymentClass {
  return d?.employment_type === 'w2_company' ? 'w2' : 'contractor';
}
```

`'1099_contractor'` and `'lease_purchase'` collapse to `contractor` for math; lease-specific behavior lives in the escrow step (§3).

### `calculateLoadPay` / `calculateWeeklyPay`

- Unchanged math for `contractor`: gross = base + accessorials (current behavior). No tax withheld here — taxes are the contractor's responsibility.
- For `w2`:
  - Only `hourly` and `per_mile` are legal pay types. `percentage` and `flat` fall through to `payType: 'unknown'` with `total: 0` and a `formulaLabel` of `"W-2 drivers must be hourly or per-mile"` (UI already surfaces formulaLabel).
  - Returns gain a `grossPay`, `taxWithholding`, and `netPay`. `total` continues to mean gross so existing dashboards don't shift meaning.
  - Tax withholding uses a single configurable effective rate (default **22%**) applied to gross. No FICA/state breakdown — payroll exports remain out of scope. Source of the rate:
    - New optional `PaySettings.w2WithholdingRate?: number` (0..1).
    - Falls back to constant `DEFAULT_W2_WITHHOLDING = 0.22`.
  - No accessorials / percentage revenue splits are tracked for W-2.

Updated return shape (additive — old fields preserved):

```ts
interface PayBreakdown {
  base: number;
  accessorialsTotal: number;
  total: number;            // = gross
  grossPay: number;         // new
  taxWithholding: number;   // new (0 for contractors)
  netPay: number;           // new (= gross - withholding - 0 deductions here)
  payType: ...;
  employmentClass: EmploymentClass; // new
  formulaLabel: string;
}
```

`WeeklyPayResult` gets the same `grossPay / taxWithholding / netPay / employmentClass` additions.

### Tests

Extend `src/utils/payCalculations.test.ts` with:
- W-2 hourly → withholding applied, net = gross × 0.78.
- W-2 per-mile → same.
- W-2 percentage → returns 0 with the warning label.
- 1099 / lease contractor → no withholding (parity with today).

## 2. `driver_settlement_items` deduction processing (DB)

Settlement totals are computed in the existing `public.recalc_settlement_totals(_settlement_id uuid)` function. Update it so it:

1. Sums `driver_settlement_items` grouped by `item_type`:
   - `load_pay`, `accessorial` → gross
   - `reimbursement` → reimbursements
   - `deduction` → deductions (was already in scope but make it explicit and authoritative)
2. Computes:
   - `gross_pay = sum(load_pay + accessorial)`
   - `reimbursements = sum(reimbursement)`
   - `deductions = sum(deduction)` (stored positive)
   - For **W-2**: `net_pay = gross_pay - (gross_pay * withholding_rate) - deductions + reimbursements`. `withholding_rate` read from `company_settings.w2_withholding_rate` (default 0.22). Store the dollar amount in a new column `tax_withholding numeric` (additive schema change inside the same migration).
   - For **contractor (1099 / lease)**: `net_pay = gross_pay + reimbursements - deductions` (matches the user's rule).
3. Writes `gross_pay`, `reimbursements`, `deductions`, `tax_withholding`, `net_pay` back to `driver_settlements`.

This keeps a single math model for any future deduction row added to `driver_settlement_items` regardless of which UI inserts it.

## 3. Escrow capture for lease operators

Add an `is_escrow boolean NOT NULL DEFAULT false` column on `driver_settlement_items` so an escrow deduction is unambiguous (description-string matching would be brittle). All existing rows default to `false`.

Inside `recalc_settlement_totals`, after the deduction sum:

```text
if driver.employment_type = 'lease_purchase':
  escrow_added := SUM(amount) FROM driver_settlement_items
                   WHERE settlement_id = _id
                     AND item_type = 'deduction'
                     AND is_escrow = true
  if escrow_added > 0:
    UPDATE lease_purchase_agreements
      SET current_escrow_balance = current_escrow_balance + escrow_added,
          updated_at = now()
      WHERE driver_id = _settlement.driver_id
        AND org_id   = _settlement.org_id
        AND status   = 'active'
```

Escrow deductions still count toward `deductions` (the driver doesn't get that money in their check) — they're just *also* mirrored into the lease's running escrow pool, exactly per the spec.

To keep escrow idempotent under repeated recalcs, store a marker on the settlement: add column `escrow_credited_amount numeric NOT NULL DEFAULT 0` on `driver_settlements`. The DB function applies only the **delta** between the new escrow sum for the settlement and the previously credited amount, then updates `escrow_credited_amount`. Re-running recalc is safe; editing/removing the escrow line correctly reverses (or increases) the balance.

## 4. Out of scope (intentionally)

- Real US tax tables / FICA / state withholding. The 22% effective rate is a placeholder configurable from `company_settings`.
- UI to pick `is_escrow` on a deduction line (next turn — can add a checkbox in the settlement item editor).
- Automatic creation of weekly lease + escrow deduction lines from `lease_purchase_agreements.weekly_lease_amount` / `escrow_cpm_rate`. That's a separate "generate-settlements" change.
- Escrow withdrawals (negative escrow lines) — current spec is additive only.

## Files touched

- `src/utils/payCalculations.ts` (extend types + branching)
- `src/utils/payCalculations.test.ts` (new cases)
- Migration that:
  - adds `driver_settlements.tax_withholding`, `driver_settlements.escrow_credited_amount`
  - adds `driver_settlement_items.is_escrow`
  - adds `company_settings` default for `w2_withholding_rate` (no row inserted; read with fallback 0.22)
  - rewrites `public.recalc_settlement_totals` with the branching above

No other UI files are modified in this turn.

Approve to implement.
