## Plan

The active PDF path is jsPDF (string-based), not html-to-pdf. Tailwind print classes won't help that path, so the page break has to be implemented inside the generator. I'll also add the requested print classes in the interactive renderer so anyone using the browser's Print dialog gets matching breaks.

### 1. Hard page break in generated PDFs
**File:** `src/lib/onboarding/generateSignedPdf.ts`

- Before the existing `TOKEN_REGEX` tokenizer loop, split `content` on `/\{\{\s*page_break\s*\}\}/`.
- Render each chunk through the existing markdown/token pipeline (extract the per-chunk rendering into a small inner helper so the current logic is reused unchanged).
- Between chunks, call `doc.addPage()` and reset `y = marginTop`. This guarantees each chunk starts on a fresh PDF sheet, matching the sections the driver saw during onboarding.
- Footer logic remains a single trailing block on the final page (current behavior preserved).

### 2. Print-friendly DOM breaks (browser Print → PDF path)
**File:** `src/pages/DriverOnboarding.tsx`

- In the success screen and in the document step rendering, add the `print:break-after-page` class to a wrapper around each chunk so that if anyone uses browser Print on the page, each chunk lands on its own sheet.
- For the interactive document step, additionally render the other (non-current) chunks inside a `hidden print:block print:break-after-page` wrapper so all chunks appear in print output, not just the page the driver is viewing.

### 3. No changes needed in `SignedOnboardingDocuments.tsx`
That admin view opens the already-generated PDF via a signed URL; the fix in step 1 means those stored PDFs already contain the hard page breaks.

### Out of scope
- Re-rendering historical signed PDFs that were generated before this change (they were created without page breaks; only newly signed documents benefit).
- Building a full DOM-based preview component for the success/admin screens (no such component exists today).