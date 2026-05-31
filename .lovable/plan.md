## Context

The `drivers` table already has both columns:
- `pay_type` (text, default `'percentage'`)
- `pay_rate` (numeric, default `0`)

Existing RLS already gives admins (owner + payroll_admin) full manage rights, and drivers can read their own row. **No migration is needed** — this is a pure UI task to expose the predefined contract terms.

## Changes

### 1. `src/pages/Drivers.tsx` — admin edit dialog
Update the Pay Type `<Select>` (around line 631–639) to use the four predefined contract terms:
- `cpm` → "CPM (Cents per Mile)"
- `flat` → "Flat Rate"
- `percentage` → "Percentage"
- `hourly` → "Hourly"

Keep the existing `flat` and `percentage` values to preserve current data; rename `per_mile` → `cpm` only in the UI label set and add a one-time mapping when reading (`per_mile` displays as CPM). Add `hourly` as a new option.

Update the row display formatter (line 495) and the `DriverSettings.tsx` display (line 459-461) to show the correct unit per type:
- `percentage` → `{rate}%`
- `cpm` / `per_mile` → `${rate}/mile`
- `flat` → `${rate} flat`
- `hourly` → `${rate}/hr`

### 2. `src/pages/DriverOnboarding.tsx` — read-only surface
Add a small "Contract Terms" read-only line in the onboarding summary/success step showing the driver's assigned `pay_type` and `pay_rate` (fetched from the driver row that's already loaded). Drivers cannot edit it — it's informational only.

### 3. No schema/migration changes
Per your selection, we keep the schema as-is. RLS already enforces:
- Drivers: SELECT own row only
- Owner + payroll_admin: full ALL access

## Out of scope
- DB-level enum/CHECK constraint on `pay_type`
- Backfilling existing `per_mile` → `cpm` values (handled at the display layer instead)
- Editing pay terms from `DriverDetailSheet` (you chose dashboard dialog only)
