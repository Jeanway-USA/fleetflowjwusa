# Unified Driver Settlements Tab

Replace the **Payroll & Commissions** and **Settlements** tabs in `src/pages/Finance.tsx` with a single **Driver Settlements** tab containing two sections: Pending Drivers and Generated Paystubs.

## File structure

```
src/components/finance/driver-settlements/
├── DriverSettlementsTab.tsx        # orchestrator
├── PendingDriversTable.tsx         # top section
├── GeneratePaystubDialog.tsx       # opened from row action
└── GeneratedPaystubsTable.tsx      # bottom section
```

`PayrollTab.tsx` and `SettlementsTab.tsx` are removed from the Finance routing (files kept on disk, not imported).

## Layout

```text
┌─ Driver Settlements ──────────────────────────────────────────┐
│ Week selector  (Mon–Sun current pay cycle, prev/next nav)     │
├───────────────────────────────────────────────────────────────┤
│ PENDING / UNSETTLED DRIVERS  (this week)                      │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Driver | Loads | Gross | Est. Pay | Pay Type | [Generate]│ │
│ └───────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────┤
│ GENERATED PAYSTUBS         filters: [All|Draft|Approved|Paid] │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Driver | Period | Base | Bonus | Deduct | Net | Status   │ │
│ └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## Behavior

### Pending Drivers (top)
- Query active drivers in org. For each, count delivered loads in the selected week that are **not yet attached to a `driver_settlement_items` row**.
- Compute estimated pay using each driver's `pay_type` (percentage / per-mile / flat) — same formulas already used in `DriverPayWidget`.
- Row action **Generate Paystub** opens `GeneratePaystubDialog`.

### Generate Paystub dialog
- Pre-fills: `driver_id`, `period_start`/`period_end` (selected week), `base_pay` (from loads), `bonus_pay` (0 or auto-filled safety bonus), `deductions` (sum of driver advances/fees this period).
- Lists settled loads as editable line items; allow adding manual adjustments.
- Submit → insert one `driver_settlements` row (status `draft`) plus `driver_settlement_items` rows for each load and deduction. Driver disappears from Pending list, appears in Generated Paystubs.

### Generated Paystubs (bottom)
- Query `driver_settlements` ordered by `period_end desc`, filterable by status (All / Draft / Approved / Paid).
- Row actions: **View / Edit** (draft only), **Approve** (draft → approved, sets `approved_by`/`approved_at`), **Mark Paid** (approved → paid, sets `paid_at`).

## Other changes in `Finance.tsx`
- Remove `<TabsTrigger value="payroll">` and `<TabsTrigger value="settlements">` plus their `<TabsContent>`.
- Add `<TabsTrigger value="driver-settlements">Driver Settlements</TabsTrigger>` and matching content.
- Move `CommissionsTab` into the Overview tab (commissions are agent earnings, separate concept from driver pay).
- Update top KPI card `totalPayroll` to source from `driver_settlements` (status in approved/paid) instead of legacy `driver_payroll`.
- Add memory entry `mem://features/finance/driver-settlements` documenting the unified tab.

## Out of scope
- Landstar statement importer (untouched, no longer surfaced in Finance tabs).
- PDF paystub rendering / email delivery (placeholder).
- Backfill of historical `driver_payroll` rows.
- Removing legacy `driver_payroll` / `settlements` tables.
