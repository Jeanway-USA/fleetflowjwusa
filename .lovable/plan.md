## Objective
Restyle the document viewing area in `src/pages/DriverOnboarding.tsx` so it feels like a professional e-signature platform (DocuSign).

## Changes

### 1. Gray page background
- Wrap the main onboarding content in a full-viewport muted gray background (`bg-slate-100` or `bg-gray-100`, `min-h-screen`).
- Ensure the existing `container max-w-4xl py-10` content remains centered.

### 2. Paper-like document container
- For document-review steps (when `currentTemplate` is rendered), replace the current `rounded-md border bg-card p-6` wrapper with a container styled as a sheet of paper:
  - `bg-white`
  - `shadow-2xl`
  - `p-8 md:p-12 lg:px-16 lg:py-12`
  - `max-w-4xl mx-auto`
  - `rounded-sm` (subtle, not heavily rounded)
  - Print-safe: `print:shadow-none print:bg-white`
- The paper container should sit directly on the gray background for contrast. To achieve this, the outer `<Card>` will be made transparent / borderless for document steps, or the document will be rendered outside the Card while keeping the header/title and action buttons adjacent to it.

### 3. Legal-document typography
- Inside the paper container, apply a highly legible font stack:
  - `font-serif` (Georgia / Cambria system stack) for the legal-prose feel.
  - `leading-relaxed` for comfortable reading.
  - `text-foreground` to respect the theme.
- Ensure inline input fields and the signature pad within `DocumentTemplateRenderer` remain usable and do not break the layout at this padding.

### 4. Preserve existing behavior
- Keep the credentials step (`DriverCredentialsStep`) and the success screen unchanged in structure; only the document viewing area receives the new styling.
- Maintain existing print styles (`print:break-after-page`, etc.) and page-break logic for multi-page documents.
- Preserve progress bar, step navigation, and action buttons (Previous / Next / Continue / Sign & Submit).

### 5. No database or logic changes
- This is purely a frontend styling refactor. No new dependencies, no backend changes, no modifications to token parsing or PDF generation.

## Files to modify
- `src/pages/DriverOnboarding.tsx` — layout and container classes.
- Possibly `src/index.css` if a custom serif font family utility is needed beyond Tailwind's default `font-serif`.