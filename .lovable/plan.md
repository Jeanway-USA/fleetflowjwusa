## Add `{{cdl_number}}` and `{{contractor_state}}` template variables

Two new tokens for onboarding document templates:
- `{{cdl_number}}` — renders an **input field** for the driver to type their CDL/license number (not pulled from their profile).
- `{{contractor_state}}` — auto-derived from what the driver types into `{{driver_address}}` (US 2-letter state code).

### Changes

1. **`src/lib/us-states.ts`**
   - Add and export `extractStateFromAddress(address: string): string | null`. Prefers a `", ST ZIP"` pattern, falls back to the last valid 2-letter US state token in the string.

2. **`src/components/onboarding/DocumentTemplateRenderer.tsx`**
   - Extend `TOKEN_REGEX` to include `cdl_number` and `contractor_state`.
   - Add props `cdlNumber: string` and `onCdlNumberChange: (value: string) => void`.
   - `cdl_number` renders as an inline `<Input>` (styled like `driver_address`) wired to the new props.
   - `contractor_state` renders as bold inline text computed from current `driverAddress` via `extractStateFromAddress(...)`; shows `[State]` placeholder when none can be parsed.

3. **`src/lib/onboarding/generateSignedPdf.ts`**
   - Extend `TOKEN_REGEX` to include `cdl_number` and `contractor_state`.
   - Add `cdlNumber: string` to `GenerateSignedPdfArgs`.
   - In the token switch: append `cdlNumber` (or `________`) and the parsed state from `driverAddress` (reuse `extractStateFromAddress`).

4. **`src/pages/DriverOnboarding.tsx`**
   - Extend `TemplateState` with `cdlNumber: string`.
   - Default state initializes `cdlNumber: ''`.
   - Add a "needs CDL number" check (mirroring `needsDriverAddress`); include in `canContinue` so drivers must fill it when the token is present.
   - Pass `cdlNumber` + `onCdlNumberChange` to `<DocumentTemplateRenderer />`.
   - Pass `cdlNumber` to `generateSignedPdf(...)` in `finalizeSubmission`. Optionally persist on the `driver_signed_documents` insert only if a column already exists — otherwise skip (no DB migrations in this scope).

5. **`src/components/settings/DocumentTemplatesPanel.tsx`**
   - Append two entries to the `VARIABLES` reference list:
     - `{{cdl_number}}` — "Renders an input field for the driver to fill in their CDL / license number."
     - `{{contractor_state}}` — "Auto-derived from the state portion of `{{driver_address}}` (US 2-letter code)."

### Out of scope
- No DB migrations and no new columns. The typed CDL number lives in the generated PDF; it is not separately stored.
- No edits to existing template content — admins insert the new tokens themselves.