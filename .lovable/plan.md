## Plan: Add "Valid" Badge to Credentials & Compliance

### Context
The "Credentials & Compliance" section already exists in `src/pages/Drivers.tsx` and `src/pages/DriverSpectatorView.tsx` via the shared `src/components/drivers/CredentialsCompliance.tsx`, with red "Expired" and yellow "Expiring Soon" badges already wired through `StatusBadge`. The `drivers` query in `Drivers.tsx` already does `select('*')`, so all needed columns (`license_number`, `license_expiry`, `medical_card_expiry`, `endorsements`, `has_twic`, `twic_expiry`) are already returned.

Note: the database columns use existing names (`license_expiry`, `medical_card_expiry`, `has_twic`, `twic_expiry`) per the project memory — no schema changes.

`src/components/crm/ContactDetailSheet.tsx` is for CRM brokers/carriers and contains no driver references — it is not used for driver details and will not be modified.

### Changes

#### 1. `src/components/shared/StatusBadge.tsx`
Add a `"valid"` entry mapped to `success` (green) so the shared badge can render the new healthy-credential state.

#### 2. `src/components/drivers/CredentialsCompliance.tsx`
Update `ExpiryBadge` so that when a date is present and more than 30 days in the future, it returns a green `<StatusBadge status="valid" />` instead of `null`. Keep the existing rules:
- Past date → red **"Expired"**
- ≤ 30 days away → yellow **"Expiring Soon"**
- > 30 days away → green **"Valid"** (new)
- No date → no badge

This change automatically flows to both the admin driver card grid (`Drivers.tsx`) and the spectator detail view (`DriverSpectatorView.tsx`).

### Out of Scope
- No database migrations.
- No changes to the driver list query (already `select('*')`).
- No changes to `ContactDetailSheet.tsx` (unrelated to drivers).
- No changes to the Add/Edit driver form.