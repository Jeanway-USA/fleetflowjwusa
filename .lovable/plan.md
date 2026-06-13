## Task 1 — Lookup table for accessorial categories

New table `public.accessorial_types`, scoped per org so each company can grow their own list later, but seeded globally for every existing org so the dropdown works on day one.

```sql
CREATE TABLE public.accessorial_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_is_driver_pay boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
```

- GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`; GRANT ALL to `service_role`.
- RLS: SELECT for same-org users (`org_id = get_user_org_id(auth.uid())`); INSERT/UPDATE/DELETE restricted to `has_admin_access(auth.uid())` and same org. `updated_at` trigger via existing `update_updated_at_column()`.
- Trigger `set_accessorial_types_org_id` (mirrors existing `set_trucks_org_id` pattern) fills `org_id` from `get_user_org_id(auth.uid())` on insert.
- Seed: one INSERT per org × default type so every existing org receives the standard list:
  - Driver pay (default true): Detention, Layover, Tarping, Expedited Service
  - Company (default false): Tolls, Permits, Lumper Fees, Trailer Wash Out, Route Surveys, Transfer of Lading
- New-org bootstrap: append the same seed inside `public.create_onboarding_org` so brand-new tenants get the list automatically.

## Task 2 — Dropdown in load create/edit (`src/pages/FleetLoads.tsx`)

Single dispatcher-facing editor handles both create and edit.

- Add a TanStack query for `accessorial_types` (active rows, sorted by `sort_order, name`) keyed by org.
- Replace the free-text "Type" input in the accessorial grid row (~line 1106) with a `Select`:
  - Options come from the query.
  - On change, set `accessorial_type` AND auto-set `is_driver_pay = type.default_is_driver_pay`. The existing "Payable To" Driver/Company select stays so dispatchers can still override per row.
  - Legacy free-text values on existing rows are preserved by injecting them as a disabled item at the top of the list if not found (prevents "value missing" warnings on old loads).
- `addAccessorial` seeds new rows with the first list entry's name and its `default_is_driver_pay`, falling back to `Detention`/`true` if the list is empty.
- Remove the `ACCESSORIAL_TYPES` constant (lines 39-50) — no longer needed.
- No other field touched; existing insert/update payloads already write `is_driver_pay`.

Out of scope (not requested):
- No admin UI to manage the lookup table this turn — defaults cover the spec; a settings screen can be added later.

## Task 3 — Payroll util (`src/utils/payCalculations.ts`)

Already correct from the prior turn: `sumAccessorials` filters `a?.is_driver_pay !== false` before summing, and both `calculateLoadPay` and `calculateWeeklyPay` route through it. Verification only:

- Re-read the file and confirm the filter is intact.
- Re-run `payCalculations.test.ts` (it already covers driver-only sums, mixed rows, and legacy rows).
- No code changes expected. If the filter has regressed, restore it.

Company-side accounting is unchanged: the load row still carries the full accessorial total, so `gross_revenue` and revenue dashboards continue to capture company-pay accessorials as revenue/expenses while driver settlements exclude them.

## Files touched

- New migration: `accessorial_types` table + RLS + GRANTs + org-id trigger + seed for existing orgs + edit `create_onboarding_org` to seed new orgs.
- `src/pages/FleetLoads.tsx` — dropdown wiring, query, auto-fill of `is_driver_pay`, removal of free-text constant.
- `src/integrations/supabase/types.ts` regenerates after migration.
- No changes expected to `payCalculations.ts` beyond verification.
