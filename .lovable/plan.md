# Workforce Architecture Schema Migration

Scope is strictly database. No frontend/UI changes in this plan.

## 1. `drivers.employment_type` column

Add an enum-backed column to `public.drivers`:

- Create Postgres enum `public.employment_type_enum` with values: `w2_company`, `1099_contractor`, `lease_purchase`.
- Add column `employment_type employment_type_enum NOT NULL DEFAULT 'w2_company'`.
  - Default lets the migration succeed on existing rows without guessing classification.
  - Owners/payroll admins can re-classify drivers via existing driver edit flow later.

The existing `prevent_driver_self_sensitive_update` trigger already blocks drivers from self-editing sensitive identity/pay fields; I'll extend it to also block `employment_type` so drivers can't reclassify themselves.

## 2. `lease_purchase_agreements` table

```text
id                        uuid PK (gen_random_uuid)
org_id                    uuid NOT NULL  -- multi-tenant key
driver_id                 uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE
truck_id                  uuid NULL     REFERENCES trucks(id)  ON DELETE SET NULL
weekly_lease_amount       numeric(12,2) NOT NULL DEFAULT 0
escrow_cpm_rate           numeric(8,4)  NOT NULL DEFAULT 0     -- e.g. 0.10
current_escrow_balance    numeric(12,2) NOT NULL DEFAULT 0
total_weeks_remaining     integer       NOT NULL DEFAULT 0
status                    text          NOT NULL DEFAULT 'active'  -- active | paid_off | terminated
notes                     text
created_at                timestamptz   NOT NULL DEFAULT now()
updated_at                timestamptz   NOT NULL DEFAULT now()
```

Notes:
- `truck_id` is `uuid` because `public.trucks.id` is uuid in this project — keeping a real FK gives referential integrity.
- `org_id` added (not in your column list) because the tenant-isolation requirement (#3) needs a column to filter on. This matches every other tenant table.
- Indexes: `(org_id)`, `(driver_id)`, `(truck_id)`, partial `(driver_id) WHERE status = 'active'` so the dashboard can quickly find an active lease per driver.
- `updated_at` trigger reuses existing `public.update_updated_at_column()`.
- Auto-fill `org_id` from `auth.uid()` via a BEFORE INSERT trigger (same pattern as `set_trucks_org_id`, `set_driver_request_org_id`).

## 3. Security (RLS, GRANTs, tenant scoping)

Follow the project's standard four-step pattern:

1. CREATE TABLE (above).
2. GRANTs:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_purchase_agreements TO authenticated;
   GRANT ALL ON public.lease_purchase_agreements TO service_role;
   ```
   No `anon` grant — leases are never publicly readable.
3. `ENABLE ROW LEVEL SECURITY`.
4. Policies (all scoped through `get_user_org_id(auth.uid())`):
   - **SELECT** — `org_id = get_user_org_id(auth.uid())` AND (
       `is_owner(auth.uid())` OR
       `has_role(auth.uid(),'payroll_admin')` OR
       `has_role(auth.uid(),'dispatcher')` OR
       `driver_id = get_driver_id_for_user(auth.uid())`  -- drivers see only their own lease
     )
   - **INSERT / UPDATE / DELETE** — `org_id = get_user_org_id(auth.uid())` AND (`is_owner(...)` OR `has_role(...,'payroll_admin')`). Drivers and dispatchers cannot mutate lease terms.

All policies use the existing security-definer helpers (`get_user_org_id`, `is_owner`, `has_role`, `get_driver_id_for_user`) so there is no recursion risk and tenant isolation matches every other table in the project.

## Out of scope (will be follow-up turns if you want)

- UI to pick `employment_type` in the driver create/edit form.
- UI to create/manage lease agreements and surface escrow balance on the driver detail sheet.
- Payroll/settlement integration that auto-deducts `weekly_lease_amount` and accrues `escrow_cpm_rate * miles` into `current_escrow_balance`.
- Backfilling existing drivers to `1099_contractor` or `lease_purchase` instead of the default `w2_company`.

Approve to run the migration.
