## Plan: Add `{{phone_number}}` Template Variable

### Goal
Allow admins to use a `{{phone_number}}` token in document templates so the driver’s phone number is auto-injected as plain text during driver onboarding.

### Changes

1. **Reference Guide** (`src/components/settings/DocumentTemplatesPanel.tsx`)
   - Append `{ token: "{{phone_number}}", description: "Auto-fills the driver's phone number captured in onboarding Step 1." }` to the `VARIABLES` array.

2. **Template Parser** (`src/components/onboarding/DocumentTemplateRenderer.tsx`)
   - Add `phone_number` to the `TOKEN_REGEX` capture group.
   - Add `phoneNumber?: string | null` to `DocumentTemplateRendererProps`.
   - Add a `case 'phone_number':` branch that renders the number as plain text (or `[Not provided]` when blank).

3. **Driver Onboarding** (`src/pages/DriverOnboarding.tsx`)
   - Include `phone` in both `drivers` SELECT queries (the React Query fetcher and the `finalizeSubmission` fetcher).
   - Pass `phoneNumber={driverRow?.phone}` to `<DocumentTemplateRenderer />`.

### Out of Scope
- No database migration needed (`phone` column already exists on `drivers`).
- No changes to `generateSignedPdf` or admin CSV import.

### Acceptance Criteria
- `{{phone_number}}` appears in the Admin Document Templates Variable Reference Guide.
- When a template includes `{{phone_number}}`, the driver onboarding page displays the driver’s phone number as plain text.
- If the driver has no phone number on file, the token renders as `[Not provided]`.