### Task 1 — Schema migration (`load_accessorials`)
Add a single column with a safe default so historical payroll math is unchanged:

```sql
ALTER TABLE public.load_accessorials
  ADD COLUMN is_driver_pay boolean NOT NULL DEFAULT true;
```

- `DEFAULT true` ensures every existing row is treated as driver-payable (current behavior).
- No RLS or grant changes — the column inherits the table's existing policies.
- After approval, regenerate types so `load_accessorials.is_driver_pay` is typed throughout the client.

### Task 2 — UI input segregation (`src/pages/FleetLoads.tsx`)
This is the single dispatcher-facing accessorial editor used for both load creation and edit.

- Extend the local `Accessorial` interface (line 52) with `is_driver_pay: boolean`.
- `addAccessorial` (line 270) seeds new rows with `is_driver_pay: true`.
- `openDialog`'s fetch mapping (line 225) reads `is_driver_pay` from the DB row, falling back to `true` if null.
- Both insert mappings — create flow (line 144) and update flow (line 177) — include `is_driver_pay: acc.is_driver_pay` in the payload sent to `load_accessorials`.
- Editor row (line 1106 grid): retighten the column layout to `grid-cols-12` and add a new "Payable To" `Select` with options **Driver** (`is_driver_pay = true`) and **Company** (`is_driver_pay = false`). Layout:
  - Type 3 cols → Payable To 2 cols → Amount 2 cols → % Paid 2 cols → Net 2 cols → Delete 1 col.
  - When **Company** is selected, the Net cell shows a small muted "Company expense" tag so dispatchers can see at a glance it won't reach the driver.
- Net total footer (line 1163) keeps showing the total $ for the load; an additional small line below it shows "Driver portion: $X" computed from rows where `is_driver_pay === true` so the dispatcher has immediate visual confirmation.

### Task 3 — Payroll guardrail (`src/utils/payCalculations.ts`)
- Widen the line-37 type: `load_accessorials?: Array<{ amount?: number | null; is_driver_pay?: boolean | null }> | null;`
- Update `sumAccessorials` (line 74) so it filters before summing:
  ```ts
  return load.load_accessorials
    .filter((a) => a?.is_driver_pay !== false) // default true preserves legacy rows
    .reduce((s, a) => s + n(a?.amount), 0);
  ```
  Using `!== false` keeps historical/undefined values flowing into driver pay, which matches the migration default.
- `calculateLoadPay` and `calculateWeeklyPay` already route every accessorial figure through `sumAccessorials`, so this single change automatically excludes Company accessorials from per-load pay, weekly pay, settlements, paystubs, and the driver dashboard widgets.
- Update `src/utils/payCalculations.test.ts` with one new case: a load with two accessorials — one `is_driver_pay: true` ($100) and one `is_driver_pay: false` ($75) — asserting `sumAccessorials` returns `100` and `calculateLoadPay(...).accessorialsTotal === 100`. Add a second case confirming legacy rows (no flag) still sum.

### Out of scope (intentionally untouched)
- Company P&L / revenue analytics: the company accessorials remain on the load row as before, so `gross_revenue` and revenue dashboards keep counting them. Only the driver-pay reducer changes.
- Settlement display components (`SettlementsTab`, `DriverSettlementsTab`, `MyPaystubsDialog`, etc.) all already call `sumAccessorials`, so they pick up the new filter for free — no per-screen edits needed.

### Verification
- Existing load with no flag → driver still gets accessorial in pay (default `true`).
- New load with one Driver and one Company accessorial → driver sees only the Driver amount in `Estimated Pay`, the paystub breakdown, and the weekly settlement; the load's `accessorialsTotal` in the editor still shows the combined total for company revenue tracking.
- Toggle a row from Driver → Company and save → next refresh excludes that row from driver pay everywhere without losing the record.