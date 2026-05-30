## Plan: Wire Phone Number into Onboarding (No Migration)

### Context
The `drivers` table already has a `phone` column (`text`, nullable) that is used throughout the admin UI, CSV import, and demo seed data. Per your decision, no new column will be added — the onboarding form just needs to read/write the existing `phone` field so drivers can self-serve their number during onboarding.

### Changes

#### 1. `src/components/onboarding/DriverCredentialsStep.tsx`
Add an optional `phoneNumber` field to the Zod schema, the form UI, the payload type, and `buildDefaultValues`:
- **Zod**: `phoneNumber: z.string().trim().min(10, 'Enter a valid phone number').max(20).optional().or(z.literal(''))` — accepts 10–20 chars, allows blank if the admin already filled it in.
- **UI**: A new `Input` field labeled "Phone Number" rendered immediately after License Number, using the same `pl-4 sm:pl-3` padding standard and `inputMode="tel"` / `autoComplete="tel"`.
- **Payload**: Extend `DriverCredentialsPayload` with `phone: string | null` and emit `v.phoneNumber?.trim() || null` from `submit()`.
- **Defaults**: `buildDefaultValues` reads `row?.phone` and seeds the input with it.

#### 2. `src/pages/DriverOnboarding.tsx`
The existing `supabase.from('drivers').update(payload)` call in `handleContinue` automatically picks up the new `phone` field — no further changes needed. Just verify the driver query already includes `phone` (it uses `select('*')` per current code).

### Out of Scope
- No database schema migration (column already exists).
- No new `phone_number` column.
- No changes to the admin Drivers page or CSV import (already use `phone`).

### Technical Details
- The Supabase types file (`src/integrations/supabase/types.ts`) is auto-generated and already includes `phone` — no edits.
- Phone validation is intentionally light (length only) to accommodate international formats; full format validation can be added later if needed.