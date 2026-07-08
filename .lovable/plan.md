## Feature: `{{consent:key}}` — required Yes/No consent

Interactive Yes/No selector inline in document templates. Values bind to `document_instances.metadata` using the explicit key from the token (e.g. `{{consent:tcpa_text_agree}}` → `metadata.consent_tcpa_text_agree`). Existing token hydration (`{{driver_name}}`, `{{today_date}}`, etc.) continues to work untouched.

## Token format

- `{{consent:<snake_case_key>}}` where key matches `^[a-z][a-z0-9_]*$`.
- Metadata key: `consent_<key>` (prefix keeps it distinct from other metadata fields).
- Stored value: string `'yes'` or `'no'`.

## Hydration (`src/lib/documents/hydrateTokens.ts`)

- Extend the token regex to allow the `:` separator so consent tokens aren't broken by the plain `{{token}}` matcher. Change the regex from `\{\{\s*([a-zA-Z0-9_]+)\s*\}\}` to `\{\{\s*([a-zA-Z0-9_:]+)\s*\}\}`.
- In `hydrateTokens`, recognize the `consent:` prefix and resolve to a checkbox glyph line for read-only rendering:
  - `[X] Yes [ ] No` when metadata is `'yes'`, `[ ] Yes [X] No` when `'no'`, `[ ] Yes [ ] No` when unset.
- In `extractUnresolvedTokens`, filter out consent tokens (they're handled by dedicated inputs, not the generic missing-token loop).
- Add a new helper `extractConsentKeys(source: string): string[]` that returns the list of `consent:<key>` occurrences (deduped, in source order). The signing panel uses this to know which Yes/No pairs to render.

## Signing panel (`src/pages/DocumentSigningWorkspace.tsx`)

- Add `consentValues: Record<string, 'yes' | 'no' | undefined>` state.
- Pre-fill from existing `instance.metadata` on load (same effect that seeds `fieldValues`).
- Render a new "Consents" section above the signature pad when the template contains any consent tokens. Each key gets:
  - The humanized label (`key.replace(/_/g, ' ')`) and two radio-style buttons: **Yes** / **No** (shadcn `RadioGroup`).
  - Required — validation blocks the sign submit until every consent has a value.
- On submit, merge `consent_<key>: value` for each answered consent into the metadata payload alongside printed name / title / date signed.

## Template rendering surfaces

- **`src/pages/DocumentSigningWorkspace.tsx`** already routes through `hydrateTokens`, so consent tokens render as `[X] Yes [ ] No` inline in the markdown preview automatically once hydration knows about them.
- **`src/components/onboarding/DocumentTemplateRenderer.tsx`** — only touched by legacy driver onboarding flow. No changes; consent tokens aren't used there.
- **`composeCompletedPdf.ts`** — the native (non-legacy) certificate page reads the hydrated text, so nothing to add there. Legacy backfilled PDFs are untouched, per requirement.

## Reference guide

Add one entry to `VARIABLES` in `src/components/settings/DocumentTemplatesPanel.tsx`:

- `{{consent:key}}` — "Renders a required Yes/No consent checkbox. Replace `key` with a snake_case name (e.g. `{{consent:tcpa_text_agree}}`). The answer is saved to the document as `consent_<key>`."

## Files touched

- `src/lib/documents/hydrateTokens.ts` — regex, consent resolution, `extractConsentKeys` helper.
- `src/pages/DocumentSigningWorkspace.tsx` — consent state, prefill, RadioGroup UI, validation, metadata write.
- `src/components/settings/DocumentTemplatesPanel.tsx` — one new reference entry.

No migrations. No changes to `document_signatures` schema.