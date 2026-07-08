
## Root cause

The PDF stored for each signed document is generated once — at the moment the **driver** signs. In `src/lib/onboarding/generateSignedPdf.ts` line 418, the `{{owner_signature}}` token is unconditionally replaced with the literal string `"[Owner Signature Pending]"`. Nothing regenerates or amends that PDF when the owner countersigns through the new signing engine, so the "completed" file you're viewing is still the frozen driver-only version.

Additionally, for **backfilled** instances we only stored a `legacy:` marker for the driver's signature (the actual signature image lives inside the original PDF), so we cannot re-render the document from scratch — we have to stamp onto the existing PDF.

## Fix

Compose a final, fully-signed PDF at the moment the instance transitions to `completed`, save it to storage, and surface it in the UI.

**1. Add `pdf-lib`** — needed to open/modify existing PDFs (jsPDF only writes new ones).

**2. New helper `src/lib/documents/composeCompletedPdf.ts`**

Given a completed `document_instance`, return a `Uint8Array` PDF that includes every signer's signature image.

- **Backfilled instances** (`metadata.legacy_file_path` present):
  1. Download the original driver-signed PDF from the `signed-documents` bucket via `pdf-lib`.
  2. Append a new "Countersignatures" page listing each non-driver signer: role label, signer name, date, and the signature PNG decoded from their `document_signatures.signature_data_url`.
  3. Return the merged bytes.
- **Native instances** (no legacy path):
  1. Build the whole PDF fresh using the same `generateSignedPdf` renderer, but pass an additional `ownerSignature` (and any other role signatures) argument so the `owner_signature` token embeds the image instead of the "Pending" placeholder.
  2. Add a small signatures block at the bottom (role, name, date, signature) for any signers whose role isn't referenced by a token in the template.

**3. `generateSignedPdf` update**

Extend the args with an optional `additionalSignatures: Array<{ role: string; name: string; dataUrl: string; signedAt: string }>` and change the `owner_signature` case: if a matching signature is provided, render it as a PNG (same as `driver_signature`); otherwise keep today's "Pending" behavior so mid-flow PDFs still work.

**4. Storage + persistence**

- Save the composed PDF to `signed-documents/{org_id}/completed/{instance_id}.pdf`.
- Write that path back to `document_instances.pdf_storage_path` (column already exists).

**5. When to compose**

- Client-side in `DocumentSigningWorkspace` right after the owner's `document_signatures` insert resolves and the instance query refetches with `status === 'completed'` — run once, guarded by `pdf_storage_path` being null.
- Same helper called from a **one-time backfill script** for the 3 already-completed instances if the owner signs before this ships (safe: the guard makes it a no-op once populated).

**6. UI**

- In `DocumentSigningWorkspace`, when `instance.status === 'completed'` and `pdf_storage_path` is set, show a primary "Download completed PDF" button next to the existing "Fully signed on…" banner. Keep the legacy "View driver's signed PDF" link when the instance is backfilled so both artifacts remain accessible.
- In `DocumentsSigning` dashboard, the "Completed" tab row already shows an "Open" link; no change needed — the workspace surfaces the download.

## Verification

1. Countersign one of the three backfilled instances as owner.
2. Confirm `pdf_storage_path` is populated and the "Download completed PDF" button appears.
3. Open the downloaded PDF: page 1 is the original driver-signed doc, appended page shows the owner's signature image with name + date.
4. For a fresh non-backfilled flow: create a template with `{{driver_signature}}` and `{{owner_signature}}`, run it end-to-end, verify the final PDF renders **both** signature images inline where the tokens are placed (no "Pending" text).

## Out of scope

- Re-issuing the original driver-signed PDF filename (kept intact — the completed PDF is a new file so audit trails aren't rewritten).
- Multi-signer templates with 3+ roles — the composed PDF handles them structurally, but visual placement for uncommon tokens like `{{supervisor_signature}}` falls back to the appended block.
