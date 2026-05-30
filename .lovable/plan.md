## Goal

Make the driver-onboarding document parser fully token-driven so that:

- `{{file_upload}}` is a first-class token rendered inline via the existing `DocumentUpload`-style box (currently the dashed upload card lives in the renderer).
- The "Continue / Submit" button gating is computed from the **parsed content** — not from `document_type === 'direct_deposit'`.
- On Submit, when a `{{file_upload}}` was present on the Direct Deposit template, the uploaded file's storage path is written to `drivers.direct_deposit_attachment_url` (this DB write already exists; we keep it).

Today the renderer's `TOKEN_REGEX` does **not** include `file_upload`, so the tag renders as literal text. The upload box is shown only because `DriverOnboarding` passes `showAttachmentUpload={isDirectDeposit}`. The gating in `canContinue` is also keyed off `isDirectDeposit` rather than off "is there a `{{file_upload}}` token in this template's content". This plan replaces both with token-driven logic.

## Files to change

### 1. `src/components/onboarding/DocumentTemplateRenderer.tsx`

- Add `file_upload` to `TOKEN_REGEX`.
- In the token switch, render the existing dashed upload box (PDF / JPG / PNG, 10 MB cap) **inline at the `{{file_upload}}` position** instead of as a trailing footer. It reuses `attachment` + `onAttachmentChange` props that are already wired in.
- Remove the `showAttachmentUpload` prop and its trailing-footer block (the token now controls placement). `attachment` and `onAttachmentChange` become required when the content contains `{{file_upload}}` — the renderer will warn (placeholder text) if the handler is missing.
- Keep all existing tokens behaving the same.

### 2. `src/pages/DriverOnboarding.tsx`

- Add a single `useMemo` per current template that parses its `content` once and returns a presence map:
  ```ts
  { hasDriverAddress, hasCdlNumber, hasDriverSignature, hasFileUpload }
  ```
  (Regex per token, same shape as the existing `needsDriverAddress` / `needsCdlNumber` checks.)
- Replace the `isDirectDeposit`-driven `canContinue` with a strict, token-driven version:
  ```text
  canContinue =
    (!hasDriverSignature || isValidSignatureDataUrl(state.signature)) &&
    (!hasDriverAddress   || state.driverAddress.trim().length > 0) &&
    (!hasCdlNumber       || state.cdlNumber.trim().length   > 0) &&
    (!hasFileUpload      || state.attachment != null)
  ```
  `isValidSignatureDataUrl` is a tiny helper: non-empty string starting with `data:image/`.
- Remove the `showAttachmentUpload={isDirectDeposit}` prop from `<DocumentTemplateRenderer>` (the renderer now picks placement from the token itself). `attachment` / `onAttachmentChange` continue to flow through.
- In `finalizeSubmission`, gate the attachment upload + the `drivers.direct_deposit_attachment_url` write on **`hasFileUpload` for that template AND `tState.attachment` present**, rather than on `document_type === 'direct_deposit'` alone. We still only write `direct_deposit_attachment_url` when the template's `document_type === 'direct_deposit'` (that column is direct-deposit-specific), but the upload + `attachment_file_path` insert now follow the parsed token, so any future template that adds `{{file_upload}}` will Just Work for storage + `driver_signed_documents.attachment_file_path`.
- No DB / migration changes. No changes to `src/pages/Onboarding.tsx` (it is the org-setup wizard and has no template parser).

## Validation rules (final, strict)

For the currently visible template, the Continue/Submit button stays disabled until **every** input the parser found is satisfied:

- Every `{{driver_address}}` instance → backed by the same `state.driverAddress`; required value: `.trim().length > 0`.
- Every `{{cdl_number}}` instance → backed by `state.cdlNumber`; required: `.trim().length > 0`.
- Every `{{driver_signature}}` instance → backed by `state.signature`; required: non-empty `data:image/...` URL.
- Every `{{file_upload}}` instance → backed by `state.attachment` (File); required: non-null and ≤ 10 MB of an accepted type (already enforced at selection time).

Note on duplicate tokens: the renderer already supports multiple occurrences of the same token; they share a single state field, so filling it once satisfies all instances. This matches the existing pattern for `{{driver_address}}` and `{{driver_signature}}`.

## Out of scope

- Refactoring `TemplateState` into a `Record<tokenName, value[]>` to support per-instance values. The current product treats duplicate tokens as the same field; changing that would alter UX without a user request.
- Any change to `src/components/shared/DocumentUpload.tsx`. The existing dashed upload box inside the renderer already provides PDF/JPG/PNG validation, 10 MB cap, and selected-file display.
- `src/pages/Onboarding.tsx` (org wizard) — no template parsing happens there.
