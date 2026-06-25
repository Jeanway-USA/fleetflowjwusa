## Goal
Replace the existing week-based settlement generator with a manual "Settlement Statement" generator that the payroll admin triggers on demand. Generation accepts target drivers + a Pay Period End date + a Payment Date, aggregates everything since each driver's last settlement, and persists a permanent record with YTD totals.

## Database changes (single migration)

Extend `driver_settlements` with the fields a real paystub needs and the YTD snapshot:

- `payment_date date` — date pay is initiated (user-selected)
- `period_start date` becomes auto-derived (day after previous settlement's `period_end`, or driver hire date / earliest delivered load if none)
- `gross_pay numeric` — sum of load pay
- `fuel_advances numeric` — sum of fuel/cash advances pulled from `expenses`
- `reimbursements numeric` — sum of reimbursement-type expenses (adds back)
- `ytd_gross numeric`, `ytd_deductions numeric`, `ytd_net numeric` — snapshot at generation time
- `generated_by uuid`, `generated_at timestamptz default now()`
- Recompute `net_pay` generated column: `gross_pay + bonus_pay + reimbursements - deductions - fuel_advances`
- Add unique index `(org_id, driver_id, period_end)` to prevent duplicate periods

Keep `driver_settlement_items` as-is; it already supports `load_pay`, `advance`, `deduction`, `reimbursement`, `bonus`, `adjustment`.

Deprecate `driver_payroll` for new writes (leave table for historical reads) and remove any Saturday auto-generator (no DB cron exists today; nothing to drop server-side — the previous "auto" path was a client button in `SettlementsTab.tsx`).

### `generate_driver_settlements` SECURITY DEFINER function

```text
generate_driver_settlements(
  _driver_ids uuid[] | null,   -- null = all active drivers in org
  _period_end date,
  _payment_date date
) returns setof driver_settlements
```

For each target driver (org-scoped, payroll/owner only):
1. Resolve `period_start` = `max(period_end) + 1` from prior settlements, else earliest delivered load date.
2. Pull `fleet_loads` where `driver_id = X`, `status = 'delivered'`, `delivery_date BETWEEN period_start AND _period_end`, and NOT already attached to a settlement item.
3. Compute load pay via the same formula as `calculateWeeklyPay` (percentage / per-mile / flat) — re-implemented in SQL using `truck_percentage` company setting and accessorials.
4. Pull `expenses` for the driver in the window: fuel advances, cash advances, reimbursements, other deductions.
5. Insert one `driver_settlements` row with status `draft`, then insert `driver_settlement_items` for each load + expense.
6. Recompute YTD: sum of all settlements for that driver where `period_end >= date_trunc('year', _period_end)` including the new row → write `ytd_gross/deductions/net`.
7. Skip drivers with zero activity (return nothing for them; surface in UI summary).

## Frontend changes

Replace the current week-stepper UI in `src/components/finance/driver-settlements/DriverSettlementsTab.tsx` (and remove the auto-generate button in `src/components/finance/SettlementsTab.tsx`):

- New **"Generate Settlements"** dialog with:
  - Driver picker: multi-select with "All active drivers" toggle
  - `Pay Period End Date` (date picker)
  - `Payment Date` (date picker, defaults to period end + 5 days)
  - Preview table showing per-driver gross / deductions / net before commit
  - Confirm → calls `supabase.rpc('generate_driver_settlements', ...)`
- Settlement list shows `period_start → period_end`, `payment_date`, gross, deductions, net, YTD net, status
- Detail sheet shows itemized loads + expenses pulled from `driver_settlement_items`, with YTD block for proof-of-income
- Print/PDF view already exists for paystubs; bind it to the new fields

Driver-side `MyPaystubsDialog` reads from `driver_settlements` (already does) — just surface the new YTD fields.

## Technical notes

- The RPC runs as `SECURITY DEFINER`, guarded by `is_owner(auth.uid()) OR has_role(auth.uid(),'payroll_admin')`, and stamps `org_id = get_user_org_id(auth.uid())`.
- All money math uses `numeric`; no floats.
- "Last settlement" lookup uses the new unique `(org_id, driver_id, period_end)` index so re-running for the same end date is idempotent (raises a clear error).
- YTD is recomputed from stored settlements (not recomputed on every read), so historical paystubs remain frozen even if later loads are edited.
- No changes to `driver_payroll`; it's left intact for backward compatibility but the UI no longer writes to it.

## Files touched

- `supabase/migrations/<new>.sql` — schema + `generate_driver_settlements` function
- `src/components/finance/driver-settlements/DriverSettlementsTab.tsx` — new UI
- `src/components/finance/driver-settlements/GenerateSettlementsDialog.tsx` — new
- `src/components/finance/driver-settlements/SettlementDetailSheet.tsx` — new (or extend existing)
- `src/components/finance/SettlementsTab.tsx` — remove client-side auto-generate
- `src/components/driver/MyPaystubsDialog.tsx` — show YTD block

## Open question
Should `Payment Date` be allowed in the past (e.g. back-dating a missed pay run), or restricted to today/future?
