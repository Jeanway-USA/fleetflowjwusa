## Root cause

There is a `BEFORE UPDATE` trigger on `public.drivers` called `prevent_driver_self_sensitive_update` (with a duplicate `trg_prevent_driver_self_sensitive_update`) that raises `42501: Drivers are not permitted to modify identity, pay, banking, or compliance fields` whenever the current user is the driver themselves and any of these columns changes:

```
license_number, license_state, license_expiry, medical_card_expiry,
mvr_expiry, hazmat_expiry, twic_expiry, has_twic, endorsements,
fast_card_passport_expiry, dod_clearance_level, employment_type,
first_name, last_name, avatar_url, direct_deposit_attachment_url,
pay_rate, pay_type, status, hire_date, user_id, org_id
```

The onboarding "Driver Profile & Credentials" step (step 2 of 3) writes exactly these compliance columns as the driver themselves. So the very first time a driver fills in their CDL, medical card, endorsements, TWIC, DoD clearance, and Landstar Operator ID, the trigger fires and raises — surfaced in the UI as the "Failed to save credentials" toast.

The trigger's intent (prevent drivers from later editing sensitive fields once onboarded) is correct. The bug is that it fires unconditionally during initial onboarding, when the driver has no choice but to write those columns.

## Fix

Rewrite `public.prevent_driver_self_sensitive_update()` so that it allows the driver's own writes only during onboarding, and continues to block them afterwards:

1. Keep the existing early exits (unauthenticated, admin/payroll writer, or updating someone else's row).
2. Add an "in onboarding" bypass. Consider the driver as still onboarding when ANY of these are true:
   - The driver's linked `public.profiles.onboarding_completed = false` (or `requires_onboarding = true`).
   - `OLD.credentials_review_status` is `NULL` or `'revision_requested'` (initial submit, or admin requested revisions).
   - The specific OLD compliance field being changed is currently `NULL` (first-time fill), evaluated per-field so we don't allow re-editing already-filled compliance data.
3. Also protect against role-simulation abuse: keep the strict block on `user_id`, `org_id`, `pay_rate`, `pay_type`, `status`, `hire_date`, `direct_deposit_attachment_url`, and `avatar_url` even during onboarding (the credentials step doesn't touch these anyway).
4. Drop the duplicate trigger. Currently both `drivers_self_update_guard` and `trg_prevent_driver_self_sensitive_update` are attached, causing the same function to run twice per UPDATE. Keep one (`trg_prevent_driver_self_sensitive_update`) and drop the other.

Net effect: a driver in onboarding (or with revisions requested) CAN save their credentials once. Once onboarded and approved, they can no longer change those fields — same guarantee as today.

## Verification

After the migration:
- Re-run the failing onboarding step 2 as the affected driver and confirm the toast becomes `Documents saved` (`credentials_review_status` flips to `pending` and `updated_at` advances).
- Confirm an already-onboarded driver still gets `42501` if they try to change their license_number/medical_card_expiry via the API.
- Confirm `pg_trigger` on `public.drivers` shows only one occurrence of the guard function.

## Out of scope

- No changes to the onboarding UI, `DriverCredentialsStep`, or `DriverOnboarding.tsx` — the update payload is already correct.
- No RLS policy changes.
- No changes to the `drivers` table schema.
- Not touching the `audit_drivers` / `trg_audit_drivers` duplicate audit triggers in this change (separate issue).

## Technical notes

- Migration is a single SQL file: `DROP TRIGGER drivers_self_update_guard ON public.drivers` + `CREATE OR REPLACE FUNCTION public.prevent_driver_self_sensitive_update()` with the new logic.
- The bypass reads `profiles` via `SELECT onboarding_completed, requires_onboarding FROM public.profiles WHERE user_id = auth.uid()`; the trigger is `SECURITY DEFINER` so RLS won't block that lookup.
- The per-field NULL bypass uses `(NEW.<col> IS DISTINCT FROM OLD.<col>) AND OLD.<col> IS NOT NULL` for each of the compliance columns — meaning re-filling a null field is always allowed regardless of onboarding state, which cleanly handles late-added fields (e.g. Landstar Operator ID for legacy drivers).
