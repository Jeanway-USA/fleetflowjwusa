## Goal
Capture the newly-added driver fields (emergency contact, FAST/passport, DoD clearance, Landstar Operator ID) in the first onboarding step so they're saved to the `drivers` row when the driver clicks "Save & Continue". TWIC conditional already exists.

## Note on the target table
The task description says "profiles table", but the new columns from the previous migration live on `public.drivers` (where every other onboarding field — license, medical, TWIC, endorsements — already lives, and where the step's submit handler writes). The plan follows the existing pattern and writes to `drivers`. Flag this in chat if "profiles" was intended.

## Changes

### 1. `src/components/onboarding/DriverCredentialsStep.tsx`
Extend the Zod schema, payload, defaults, and form UI in one file.

**Schema additions**
- `emergencyContactName: z.string().trim().min(1, 'Required').max(100)` — required
- `emergencyContactRelationship: z.string().trim().min(1, 'Required').max(60)` — required
- `emergencyContactPhone: z.string().trim().min(1, 'Required').max(20)` — required, with the same `>= 10 digits` superRefine check used for `phoneNumber`
- `fastCardPassportExpiry: z.date().optional()` — optional, no past-date guard (expired FAST cards are still data worth recording)
- `dodClearanceLevel: z.enum(['None', 'Interim Secret', 'Secret']).default('None')`
- `landstarOperatorId: z.string().trim().max(30).optional().or(z.literal(''))` — optional
- TWIC conditional: already in place (lines 84-98), no change

**Payload (`DriverCredentialsPayload`) additions**, mapped in `submit()`:
- `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relationship: string`
- `fast_card_passport_expiry: string | null` (formatted `yyyy-MM-dd` or null)
- `dod_clearance_level: 'None' | 'Interim Secret' | 'Secret'`
- `landstar_operator_id: string | null` (trim → null when empty)

**`buildDefaultValues`** — accept the new snake_case fields from the driver row and seed them (dropdown defaults to `'None'` when row value is null).

**UI layout (in order, top to bottom)**
- Existing license-number / phone fields stay.
- **New "Emergency Contact" section** placed immediately after the header block (top of form, per Task 1). Heading `<h4>` + three inputs in a 1/3-column grid: Name, Relationship, Phone. All marked with `*`.
- License Expiry / Medical / Endorsements / HAZMAT — unchanged.
- TWIC radio + conditional `twicExpiry` — unchanged.
- **New "Border & Security Credentials" section**:
  - `fastCardPassportExpiry` — shadcn Popover + Calendar with `pointer-events-auto` (matches existing date pickers; no `disabled` past-date rule).
  - `dodClearanceLevel` — shadcn `<Select>` with the three options.
- **New "Landstar Operator ID" field** at the bottom (or grouped under credentials): single `<Input>` labeled optional, placeholder `e.g. 123456`.

### 2. `src/pages/DriverOnboarding.tsx`
- Update both `supabase.from('drivers').select(...)` strings (lines 97 and 289) to include the seven new columns: `emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, fast_card_passport_expiry, dod_clearance_level, landstar_operator_id`. (`twic_expiry` is already selected.)
- Pass these fields into `buildDefaultValues(driverRow)` (already called wherever the step is mounted — no signature change needed since `buildDefaultValues` now reads more keys off the same row).
- The existing submit handler at lines 452-461 already does `supabase.from('drivers').update(payload).eq('id', driverRow.id)` — the enlarged payload from the step flows through automatically. No handler edits required beyond keeping the column list in `.select(...)` aligned for the post-update refetch.

## Out of scope
- No DB migration — columns already exist on `drivers` from the previous task.
- No change to the prevent-self-edit trigger; it already permits emergency contact (driver-editable) and the existing onboarding flow already writes other blocklisted credential fields the same way for the same logged-in driver, so the new ones behave identically.
- Admin-side Driver edit dialog already covers these fields and isn't touched here.
