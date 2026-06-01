# Refine Generate Paystub Dialog

Update `src/components/finance/driver-settlements/DriverSettlementsTab.tsx` to make the existing `GeneratePaystubDialog` match the spec.

## Changes to `GeneratePaystubDialog`

1. **Base Pay calculation** (`estimatePay` helper):
   - `pay_type === 'flat'` → return `pay_rate` exactly, ignore loads.
   - `pay_type === 'percentage'` → `sum(load.gross_revenue ?? load.rate) * (pay_rate / 100)`.
   - `pay_type === 'per_mile'` → `sum(load.actual_miles ?? load.booked_miles) * pay_rate`.
   - Fallback (unknown type) → 25 % of summed gross. Same as today.

2. **Dialog body**:
   - Show driver name, period, load count, and pay-type chip ("Flat Rate" / "Percentage @ 75%" / "Per Mile @ $0.65") at the top.
   - **Base Pay** input — pre-filled from the rule above; editable. For flat rate, display a small note "Flat rate — loads ignored".
   - **Bonus Pay** input — editable, defaults to `0`. Label hints "Safety Bonus, etc."
   - **Notes** textarea — optional.
   - Live **Net Pay** readout: `net = base + bonus`. Big primary-colored amount.
   - Loads-included list stays (read-only) for percentage/per_mile; hidden for flat.

3. **Remove**:
   - Deductions input.
   - Status dropdown.
   - The deductions row in the net-pay readout.

4. **Math invariant**: `net_pay = base_pay + bonus_pay`. The DB column `deductions` is always written as `0` so the generated `net_pay = base + bonus - 0` stays consistent.

5. **Footer — two actions**:
   - **Save as Draft** (outline) → insert with `status = 'draft'`, `approved_at = null`, `paid_at = null`.
   - **Approve & Send to Driver** (primary gradient) → insert with `status = 'approved'`, `approved_at = now()`, `approved_by = auth.uid()`. (Email "send" is a placeholder; toast confirms "Paystub approved — driver notified" but no actual email yet — out of scope, noted in memory.)
   - Cancel button on the left.

6. **Insert payload**:
   ```ts
   {
     org_id, driver_id, period_start, period_end,
     base_pay, bonus_pay,
     deductions: 0,
     status,                          // 'draft' | 'approved'
     notes: notes || null,
     approved_at, approved_by,
   }
   ```
   Then insert one `driver_settlement_items` row per included load (skipped for flat-rate since loads list is irrelevant).

7. **State reset bug fix**: the current `useMemo` for resetting form state on driver change is incorrect — switch to a proper `useEffect` keyed on `driver?.id` and `open`.

## Out of scope
- Actual email delivery to the driver (placeholder toast).
- Editing an existing paystub from the dialog.
- Deductions UI (explicitly excluded per spec).
- Mark Paid action (already handled by the row dropdown in Generated Paystubs).
