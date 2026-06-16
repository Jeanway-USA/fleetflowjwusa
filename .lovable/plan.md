## Goal
Capture and surface each driver's unique Landstar Operator ID.

## 1. Database (migration)
Add `landstar_operator_id text` column to `public.drivers` (nullable). No constraints — IDs can vary in format and may be added later. Existing RLS policies already cover the column.

Note: the `drivers` table is the canonical record for fleet drivers in this app (`profiles` is the auth/account record). Storing it on `drivers` matches every other CDL/credential field and keeps it scoped per-org via existing RLS.

## 2. Drivers page UI (`src/pages/Drivers.tsx`)
The page renders drivers as cards (not a table). Make the Operator ID visible at a glance on each card:
- Under the driver's name/status badges, add a small muted line: `Landstar ID: <value>` (only when present).
- Add `landstar_operator_id` to the `driverFields` list so it shows up in any field-driven views/exports.

## 3. Add/Edit Driver dialog (same file)
In the existing form, add a new input inside the "License & Credentials" section (alongside License Number / State):
- Label: "Landstar Operator ID"
- Bound to `formData.landstar_operator_id`, trimmed on submit, saved as `null` when blank.
The existing insert/update mutation already spreads `formData` into the `drivers` row, so once the column exists and the field is in `formData`, saves will persist automatically.

## Out of scope
- No changes to `profiles`, onboarding flow, signed documents, or driver self-serve screens.
- No uniqueness constraint (can be added later if required).
