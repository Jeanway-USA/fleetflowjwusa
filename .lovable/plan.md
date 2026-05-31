## Problem

The View Profile sheet for a driver (Drivers list → "View Profile") reads `license_number`, `license_expiry`, `medical_card_expiry`, `endorsements`, `has_twic`, `twic_expiry`, and `phone` directly from the `drivers` row. The sheet renders them correctly already — but for drivers who just finished onboarding, those columns are empty.

Root cause: `drivers` RLS only lets **owners / payroll_admin** UPDATE. When a driver completes the "Driver Profile & Credentials" step, `DriverOnboarding.tsx` runs

```ts
supabase.from('drivers').update(payload).eq('id', driverRow.id).eq('org_id', orgId)
```

as the driver. PostgREST returns no error (0 rows affected is not an error), so the UI advances and the row silently stays blank. Verified against the database: the most-recently-onboarded driver has `license_number=NULL`, `endorsements=NULL`, etc., while a manually-created sibling row is fully populated.

## Fix

Allow a driver to update **only their own credential fields** on their own `drivers` row. Implement via a new RLS UPDATE policy plus a `BEFORE UPDATE` trigger that blocks the driver from changing any sensitive column (pay, status, hire date, identity, org). No UI changes are needed because `DriverDetailSheet` + `CredentialsCompliance` already render every onboarding field.

### Migration (single)

1. New RLS policy on `public.drivers`:
   ```sql
   CREATE POLICY "Drivers can update their own credentials"
   ON public.drivers
   FOR UPDATE
   USING  (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()))
   WITH CHECK (user_id = auth.uid() AND org_id = get_user_org_id(auth.uid()));
   ```
2. Trigger function `public.prevent_driver_self_sensitive_update()` (SECURITY DEFINER, `search_path = public`) that, when the actor is the row's own driver (i.e. not owner/payroll), raises if any of these change:
   `pay_rate, pay_type, status, hire_date, user_id, org_id, first_name, last_name, avatar_url, direct_deposit_attachment_url`.
   Allowed self-edit columns: `phone, license_number, license_expiry, medical_card_expiry, endorsements, has_twic, twic_expiry, hazmat_expiry, mvr_expiry, email, updated_at`.
3. `CREATE TRIGGER drivers_self_update_guard BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.prevent_driver_self_sensitive_update();`

### Client tweak

In `src/pages/DriverOnboarding.tsx`, after the credentials `update(...)` call, also check that exactly one row was affected (`.select('id').maybeSingle()`) and surface a toast on silent RLS failure, so this class of bug can't regress unnoticed.

### Out of scope

- No changes to `DriverDetailSheet`, `CredentialsCompliance`, or the onboarding form UI.
- No changes to direct-deposit/PII fields (those still flow to signed PDFs, not the driver row).
