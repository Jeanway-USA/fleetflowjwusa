## Wire `employmentType` through the onboarding flow

The credentials step already sits at index 1 (immediately after employment type) and doesn't branch on employment type, so no reordering or field changes are needed there. This plan just threads the selected value through the rest of the flow so downstream document signing steps can react to it.

### Changes to `src/pages/DriverOnboarding.tsx`

1. **Persist alongside credentials save.** When the user clicks Continue on the credentials step (`handleContinue`, `isCredentialsStep` branch), include the mapped `employment_type` in the `drivers` update payload:
   - `'1099'` → `'1099_contractor'`
   - `'W-2'` → `'w2_company'`
   - Merge into the existing `payload` from `credentialsRef.current?.submit()` before `.update(payload)`.
   - This uses the existing `drivers.employment_type` enum column and keeps every downstream consumer (payroll, settlements, DriverDetailSheet) in sync.

2. **Hydrate on load.** When `driverRow` loads with an existing `employment_type`, initialize the local `employmentType` state from it (map back to `'1099' | 'W-2'`; treat `lease_purchase` as `'1099'` for onboarding purposes since only two options are offered). Wrapped in a `useEffect` guarded so it only runs when `employmentType === null`.

3. **Pass down to document signing steps.** Add `employmentType` as a prop on both `<DocumentTemplateRenderer>` render sites (interactive + hidden print copies). The renderer will accept it and can be consumed by later work (e.g., conditional 1099 vs W-2 clauses/tokens). No rendering changes in this plan beyond making the value available.

4. **Extend `driverRow` select** to include `employment_type` so step 2's hydration effect has the value.

### Changes to `src/components/onboarding/DocumentTemplateRenderer.tsx`

- Extend `DocumentTemplateRendererProps` with `employmentType?: '1099' | 'W-2' | null`.
- Destructure it in the component signature. No visual/logic change yet; this exposes the value for upcoming document-signing work.

### Out of scope

- No new UI on the credentials step (it stays universal: CDL, medical card, TWIC).
- No conditional template rendering by employment type yet — just plumbing.
- No schema changes (existing `employment_type` enum column is reused).
