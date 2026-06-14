## Problem

Approving a paystub fails with:
`new row for relation "driver_settlement_items" violates check constraint "driver_settlement_items_item_type_check"`

The insert in `DriverSettlementsTab.tsx` (line 481) uses `item_type: 'load'`, but the DB constraint only permits: `load_pay`, `bonus`, `deduction`, `advance`, `reimbursement`, `adjustment`, `other`.

## Fix

In `src/components/finance/driver-settlements/DriverSettlementsTab.tsx`, change the per-load item insert to use the canonical type:

- `item_type: 'load'` → `item_type: 'load_pay'`

No DB migration needed — the existing constraint is correct; the client was using a non-canonical value.

## Verification

- Approve a paystub for a driver with included loads; confirm no constraint error and rows appear in `driver_settlement_items` with `item_type='load_pay'`.
- Save-as-draft path uses the same code, so it's covered too.
