## Goal
Force drivers to visually confirm a document photo is readable before any compression or upload happens. Targets `DocumentScanButton` (BOL, fuel/lumper/scale/delivery receipts) on the driver dashboard.

## Changes

### 1. New component `src/components/driver/PhotoQualityGate.tsx`
Reusable full-screen modal. Props:
```ts
{
  open: boolean;
  file: File | null;        // image file to preview
  onRetake: () => void;     // closes + clears + re-opens camera picker
  onConfirm: () => void;    // proceeds to compress + upload
}
```
- Renders the image via `URL.createObjectURL` filling the viewport on a black background (`object-contain`, max-h `calc(100vh - 12rem)`).
- Heading: **"Is this document clearly readable?"** + helper text: "Check that all text, dates, and signatures are sharp and in-frame."
- Two stacked-on-mobile / side-by-side-on-sm buttons, both `h-14`:
  - **Retake Photo** (destructive outline, `Camera` icon) → calls `onRetake`.
  - **Looks Good, Upload** (primary, `Check` icon) → calls `onConfirm`.
- Revokes the object URL on unmount / file change.
- Uses existing `Dialog` primitive with `max-w-3xl` and `h-[100dvh]` on mobile via responsive classes, so it feels full-screen on phones without breaking desktop.

### 2. `src/components/driver/DocumentScanButton.tsx`
- Import `PhotoQualityGate` and `compressImage` from `@/lib/compress-image`.
- Add state `qualityGateOpen: boolean`.
- `handleFileChange`:
  - When an **image** is picked: store the raw File, generate preview, open quality gate. Do NOT set the file as "ready to upload" yet.
  - When a **PDF** is picked: behave as today (no preview gate — quality not visually verifiable).
- Add `handleRetake()`: revoke preview, clear `selectedFile`, close gate, re-click `fileInputRef`.
- Add `handleConfirmQuality()`: close gate (the file is already in state); inline preview thumbnail and the document-type select then appear as today.
- Modify `uploadMutation.mutationFn`:
  - If the file is an image, run `await compressImage(selectedFile)` and upload the compressed result; use the compressed file's name/size in the DB row.
  - PDFs upload as-is.
- Render `<PhotoQualityGate>` alongside the existing Dialog so it overlays the upload dialog while open.

### 3. No changes
- Storage bucket, RLS, document table schema, `useStorageProvider`, `compress-image.ts` — all untouched.
- Other photo flows (`PhotoCapture`, ProofOfDelivery) remain as-is for this scope; the new `PhotoQualityGate` component is reusable so they can opt in later.

## Verification
- Mobile viewport: tapping Scan Doc → camera → captured image opens full-screen gate; "Retake" reopens the camera; "Looks Good" returns to the upload dialog with the file ready. Submit triggers compress + upload exactly once.
- PDF upload skips the gate (existing flow preserved).
- No double-upload or stale-preview leaks (object URLs revoked).
