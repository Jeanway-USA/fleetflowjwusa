## Goal
Make `{{pay_type}}` and `{{pay_rate}}` render as read-only prose in onboarding documents (both the live renderer and the generated PDF), with a bold red fallback when admins haven't set them.

## Files

### 1. `src/components/onboarding/DocumentTemplateRenderer.tsx`
- Add `pay_type` and `pay_rate` to `TOKEN_REGEX`.
- Add optional props `payType?: string | null` and `payRate?: number | null` to `DocumentTemplateRendererProps`.
- Add two new `switch` cases that render the value as a non-editable `<span>`:
  - `pay_type` → `payTypeLabel(payType)` (e.g. "CPM (Cents per Mile)")
  - `pay_rate` → `formatPayRate(payType, payRate)` (e.g. "$0.65/mile")
- If `payType` is null/empty (for either token) or `payRate` is null (for the rate token), render `<span className="font-bold text-destructive">[TERMS NOT SET - CONTACT HIRING MANAGER]</span>`.
- Import `payTypeLabel` and `formatPayRate` from `@/lib/pay-format`.

### 2. `src/lib/onboarding/generateSignedPdf.ts`
- Add `pay_type|pay_rate` to `TOKEN_REGEX`.
- Add `payType?: string | null` and `payRate?: number | null` to `GenerateSignedPdfArgs`; destructure them in the generator.
- Add cases in the segment switch that append the formatted value to `buffer`, or `[TERMS NOT SET - CONTACT HIRING MANAGER]` when missing. (PDF is monochrome — the prominence comes from the wording; no color styling needed.)
- Import `payTypeLabel` and `formatPayRate` from `@/lib/pay-format`.

### 3. `src/pages/DriverOnboarding.tsx`
- The fetch on line 89 already pulls `pay_type, pay_rate` — no DB change.
- Pass `payType={driverRow?.pay_type ?? null}` and `payRate={driverRow?.pay_rate ?? null}` to both `<DocumentTemplateRenderer>` instances (lines ~527 and ~569).
- Pass the same two fields into whichever `generateSignedPdf({...})` call exists in this file (locate and add).

## Out of scope
- No DB migration, no admin UI changes (already shipped previously).
- No edits to the Variable Reference sidebar (already shipped last turn).