## Plan

### 1. Widen Driver Onboarding Container
**File:** `src/pages/DriverOnboarding.tsx`
- Change the main container classes from `max-w-3xl` to `max-w-4xl`.
- There are two places where `max-w-3xl` appears (loading skeleton wrapper and the main onboarding card wrapper).
- The container already uses responsive classes (`container py-10`), so mobile behavior is preserved.

### 2. Add `{{page_break}}` to Variable Reference Guide
**File:** `src/components/settings/DocumentTemplatesPanel.tsx`
- Append a new entry to the `VARIABLES` array (line ~54):
  - `token`: `"{{page_break}}"`
  - `description`: `"Splits this document into multiple readable pages for the driver, and enforces a hard page break when the final PDF is generated."`
- This will render automatically in the sidebar's Variables tab alongside existing tokens like `{{today_date}}` and `{{driver_signature}}`.

No other files need changes. The `{{page_break}}` token is UI-only documentation in the reference guide for now; actual PDF rendering support is out of scope.