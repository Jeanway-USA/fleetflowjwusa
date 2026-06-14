## Goal

Replace the hand-rolled signature canvas with `react-signature-canvas` for smoother, more reliable finger-drawn signatures on mobile. Keep the existing one-step PDF embed + inline flow you already have working.

## Scope

Only the signature capture layer changes. PDF generation, upload to `signed-documents`, and onboarding step advancement stay exactly as they are.

## Changes

1. **Add dependency**: `react-signature-canvas` (+ `@types/react-signature-canvas`).

2. **Rewrite `src/components/driver/SignaturePad.tsx`**:
   - Use `SignatureCanvas` from `react-signature-canvas`.
   - Transparent background (no white fill) so the PNG can be stamped cleanly onto any PDF backdrop. Export with `getCanvas().toDataURL('image/png')` after trimming via `getTrimmedCanvas()` so empty whitespace is cropped.
   - Mobile-friendly: `touch-none` wrapper, `ResizeObserver` for responsive width, `aspect-[8/3]`, DPR-aware via `canvasProps`.
   - Buttons: **Clear** (calls `.clear()`), **Confirm Signature** (emits trimmed transparent PNG to `onSignatureCapture`). Disabled state while empty (`.isEmpty()`).
   - Keep the exact same props contract (`onSignatureCapture(dataUrl)`, `disabled`) so `DocumentTemplateRenderer` needs no changes.
   - Landscape-friendly: min-height 180px, full width, prevents page scroll while drawing (`onBegin` adds `overscroll-contain`).

3. **No changes** to:
   - `DocumentTemplateRenderer.tsx` (already renders `<SignaturePad onSignatureCapture={...} />` inline at `{{driver_signature}}`).
   - `generateSignedPdf.ts` (already `addImage(signature, 'PNG', ...)` — transparent PNGs render fine in jsPDF).
   - `DriverOnboarding.tsx` upload + step advancement logic.
   - Storage bucket / RLS (already in place).

## Verification

- Test on mobile viewport: signature draws smoothly, Clear works, Confirm advances the step.
- Generated PDF still shows the signature on the signature line.
- File appears in `signed-documents/{org_id}/{driver_id}/...` and onboarding marks complete.

## Out of scope (per your answers)

- No two-step "preview then stamp" with `pdf-lib`.
- No separate PDF preview screen / "Tap to Sign" modal — the inline pad stays.
