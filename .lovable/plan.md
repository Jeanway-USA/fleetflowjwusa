## Add `{{driver_name}}` token

Add a new template variable that renders the printed name of the driver signing the document.

### Changes

1. **`src/components/onboarding/DocumentTemplateRenderer.tsx`**
   - Add `driver_name` to `TOKEN_REGEX`.
   - Add a new prop `driverName: string` to `DocumentTemplateRendererProps`.
   - Render `{{driver_name}}` as bold inline text (or a placeholder like "Your name" if empty).

2. **`src/pages/DriverOnboarding.tsx`**
   - Compute `driverName` from `driverRow` (first + last) once it's loaded.
   - Pass `driverName` prop into `<DocumentTemplateRenderer />`.

3. **`src/lib/onboarding/generateSignedPdf.ts`**
   - Add `driver_name` to `TOKEN_REGEX`.
   - In the token switch, append `driverName` (already a function arg) to the buffer.

4. **`src/components/settings/DocumentTemplatesPanel.tsx`**
   - Add `{{driver_name}}` entry to the `VARIABLES` reference list in the Variables tab, with description "Printed name of the driver signing the document".

### Out of scope
No DB migrations, no changes to existing template content (admins can insert the new token where they want it).