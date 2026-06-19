## Goal
Extend driver profiles with emergency contact info, border-crossing credentials, and DoD security clearance — exposed in the existing Driver edit dialog and the read-only Driver detail sheet.

## Current state
- `public.drivers` already has `has_twic` and `twic_expiry`. No emergency-contact columns, no `fast_card_passport_expiry`, no `dod_clearance_level`.
- `src/pages/Drivers.tsx` is the admin add/edit dialog. The TWIC checkbox already conditionally renders a `twic_expiry` date input (Task 3 is already done — I'll leave that block as-is).
- `src/components/drivers/DriverDetailSheet.tsx` is the read-only sheet, which renders credentials through `src/components/drivers/CredentialsCompliance.tsx`.
- Two security-relevant triggers reference the per-field column list:
  - `reset_driver_credentials_review_on_change` — bumps the credentials review back to `pending` when sensitive credential fields change.
  - `prevent_driver_self_sensitive_update` — blocks drivers from editing pay/identity/compliance fields on themselves.

## Changes

### 1. Migration (single file)
Add to `public.drivers`:
- `emergency_contact_name text`
- `emergency_contact_phone text`
- `emergency_contact_relationship text`
- `fast_card_passport_expiry date`
- `dod_clearance_level text NOT NULL DEFAULT 'None'` with a `CHECK` constraint on `('None','Interim Secret','Secret')`
- (`twic_expiry` already exists — skipped)

Update both triggers in the same migration:
- `reset_driver_credentials_review_on_change`: add `fast_card_passport_expiry` and `dod_clearance_level` to the IS-DISTINCT-FROM list (they are compliance fields; emergency contact fields are not credentials and stay out).
- `prevent_driver_self_sensitive_update`: add `fast_card_passport_expiry` and `dod_clearance_level` to the locked-down list. Emergency contact fields remain driver-editable (drivers should be able to keep their own contact current).

No new RLS policies needed — existing row-level policies on `drivers` cover all columns. No GRANT changes (table already granted).

### 2. `src/pages/Drivers.tsx` — edit dialog
- **New "Emergency Contact" section** placed right after the Name/Email/Phone block and before "Link to User Account" (near the top, per Task 2). Three inputs in a responsive grid: Name, Relationship, Phone.
- **TWIC** section: leave as-is (already meets Task 3).
- **New "Advanced Security & Border" section** placed after the existing TWIC card section:
  - `fast_card_passport_expiry` — `<Input type="date">` (matches the styling of every other expiry field in this dialog; the project doesn't use shadcn `<Calendar>` here).
  - `dod_clearance_level` — `<Select>` with options None / Interim Secret / Secret, default `'None'`.
- Update the form initialiser `setFormData({ ..., has_twic: false, endorsements: [] })` to also seed `dod_clearance_level: 'None'` so new drivers default cleanly.
- Save path already does `{ ...formData }` upsert, so the new fields flow through automatically once the columns exist and the regenerated `types.ts` includes them.

### 3. `src/components/drivers/CredentialsCompliance.tsx` — read-only display
- Extend the `driver` prop type with the four new fields.
- After the TWIC rows, add:
  - `FAST Card / Passport Expiry` (uses the existing `Row` + `ExpiryBadge`).
  - `DoD Clearance` (plain row, no expiry badge).

### 4. `src/components/drivers/DriverDetailSheet.tsx` — read-only display
- Add an "Emergency Contact" card/section near the top of the sheet (above Credentials & Compliance) showing Name, Relationship, Phone. If all three are empty, render a muted "No emergency contact on file" line so the section still anchors visually.

## Out of scope
- Driver-self profile editor (separate flow). Drivers can update their emergency contact through the admin sheet today; opening a driver-facing editor is a follow-up.
- Onboarding wizard (`DriverCredentialsStep.tsx`) does not get the new fields in this pass — onboarding scope is intentionally untouched per the request, which targets the Driver Profile sheet.
- No changes to `drivers_public_view`; the view selects a curated column list and the new fields aren't needed by its consumers (driver dropdowns).
