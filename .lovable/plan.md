## Fix Endorsement & HAZMAT Expiry Sync from Onboarding → Driver Profile

**Bug 1:** Onboarding saves endorsements as single letters (`'H'`, `'X'`); edit form checks against `'H - Hazmat'` strings → checkboxes always unchecked.

**Bug 2:** Onboarding never collects `hazmat_expiry`, so it stays null even when H/X selected.

### Changes

1. **`src/components/onboarding/DriverCredentialsStep.tsx`**
   - Add `hazmatExpiry: z.date().optional()` to schema; `superRefine` requires it (and not past) when endorsements include `'H'` or `'X'`.
   - Add `hazmat_expiry: string | null` to `DriverCredentialsPayload`; format in `submit()`.
   - Hydrate `hazmatExpiry` from `row.hazmat_expiry` in `buildDefaultValues`.
   - Render conditional HAZMAT Expiration date picker (matching TWIC UX) when H or X is checked.

2. **`src/pages/DriverOnboarding.tsx`**
   - Include `hazmat_expiry` in both `.select(...)` strings.
   - Pass it into `buildDefaultValues`. Payload update already spreads the whole object, so the new field will persist.

3. **`src/pages/Drivers.tsx`** (edit form)
   - Replace `endorsementOptions` with `{ value, label }` objects using canonical letters (`H`, `N`, `P`, `S`, `T`, `X`).
   - Update checkbox map to use `opt.value` for checked/toggle and `opt.label` for display.
   - In `toggleEndorsement`, replace `endorsement.includes('Hazmat')` with `endorsement === 'H' || endorsement === 'X'`.
   - Show HAZMAT expiry input when endorsements include `'H'` or `'X'`.

No DB migration needed.