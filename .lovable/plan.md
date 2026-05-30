## Goal

Create a new admin-facing driver profile sheet that surfaces completed onboarding data, parsed expiry badges, and signed document links. `src/components/crm/ContactDetailSheet.tsx` is intentionally left alone — it's built around `UnifiedContact` (brokers/shippers/agents/facilities/vendors) and has no driver concept. A dedicated component is the right home.

## Schema reconciliation

The request used field names that don't match `public.drivers`. Mapping used in the implementation:

| Requested | Actual column |
|---|---|
| `phone_number` | `phone` |
| `license_expiry_date` | `license_expiry` |
| `dot_medical_card_expiry_date` | `medical_card_expiry` |
| `has_twic_card` | `has_twic` |
| `twic_card_expiry_date` | `twic_expiry` |

No DB migration needed.

## Changes

### 1. New file: `src/components/drivers/DriverDetailSheet.tsx`

Sheet styled to mirror `ContactDetailSheet`:

- Props: `{ driver, open, onOpenChange, onEdit?, readOnly? }`.
- Header: avatar + first/last name, status badge, hire date.
- Top contact strip: `tel:` phone link, `mailto:` email link, license number quick glance.
- **Credentials & Compliance** section: renders the existing `<CredentialsCompliance driver={driver} variant="section" />` — already uses `StatusBadge` (Valid / Expiring Soon / Expired) with the project's `T00:00:00` date-parse guard.
- **Signed Documents** section at the bottom: renders `<SignedOnboardingDocuments driverId={driver.id} />`, but only when the viewer has admin privileges (see step 3). For non-admins the section is omitted entirely.

### 2. Wire it into `src/pages/Drivers.tsx`

- Replace the current "Documents for …" `Dialog` (driven by `selectedDriver`) with the new `DriverDetailSheet`. The dropdown row that currently calls `setSelectedDriver(driver)` ("View Documents") becomes "View Profile" and opens the sheet.
- Keep the existing `signedDocsDriver` standalone dialog as-is for the dedicated owner action; the sheet duplicates the content but gated by admin role for the new in-context flow.
- The drivers query already does `select('*')`, so `phone`, `license_*`, `medical_card_expiry`, `endorsements`, `has_twic`, `twic_expiry`, etc. are already loaded — no query change required.

### 3. Admin gating for signed documents (Owner + Safety + Payroll)

`SignedOnboardingDocuments` currently early-returns when `!isOwner`. Update it to compute `canView = isOwner || hasRole('safety') || hasRole('payroll_admin')` and use that for both the query `enabled` flag and the early return. This matches the existing RLS policy `Owner safety payroll can view org signed documents` on `driver_signed_documents`, so safety/payroll roles will actually receive rows. The "Owner-only view" label is updated to "Admin view".

In `DriverDetailSheet`, also compute the same `canView` flag and skip rendering the entire "Signed Documents" section header when false (so non-admins don't see an empty block).

## Technical notes

- Use `Sheet`/`SheetContent` with `w-full sm:max-w-lg` and the project's flex sheet structure (see `mem://technical/ui-sheet-structure`) — header + scrollable body.
- All status colors come from `StatusBadge` semantic tokens — no raw color classes.
- Dates parsed via the existing `parseDateSafe` in `CredentialsCompliance` (already `T00:00:00`-safe).
- No new dependencies, no edge functions, no migration.

## Files touched

- **new** `src/components/drivers/DriverDetailSheet.tsx`
- **edit** `src/pages/Drivers.tsx` (swap selectedDriver dialog → sheet, rename menu item)
- **edit** `src/components/drivers/SignedOnboardingDocuments.tsx` (widen gate to owner/safety/payroll)

## Acceptance

- Clicking "View Profile" on a driver row opens a right-side sheet showing phone (`tel:` link), email (`mailto:` link), credentials with colored expiry badges, and — for owner/safety/payroll only — preview/download buttons for the signed Driver Agreement, Direct Deposit, and any uploaded attachment (e.g. voided check).
- Drivers/dispatchers viewing the sheet see credentials but no Signed Documents section.
- Existing dedicated `signedDocsDriver` dialog continues to work for owners.
