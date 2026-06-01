## Goal
On the driver detail sheet, owner/payroll should see the file the driver attached during the Direct Deposit step (typically a voided check or DD form) right next to the protected Routing/Account numbers.

## Where things stand
- During onboarding, the supplemental attachment is uploaded to the `signed-documents` bucket and its path is saved to `drivers.direct_deposit_attachment_url`.
- Storage RLS already restricts `signed-documents` paths whose related `driver_signed_documents.document_type = 'direct_deposit'` to owner + payroll admin (done in the prior security pass).
- `DriverBankingDetails` already renders for owner/payroll only and shows bank name / type / last4 / reveal toggle.

So no DB or RLS changes are needed — this is a pure UI addition.

## Change
Extend `src/components/drivers/DriverBankingDetails.tsx`:

1. Add a lightweight query for `drivers.direct_deposit_attachment_url` (single field, scoped by `driverId`).
2. If a path exists, call `supabase.storage.from('signed-documents').createSignedUrl(path, 300)` to mint a short‑lived URL (5 min).
3. Render a new section under the existing fields:
   - Label: "Driver-provided attachment"
   - File-type icon + original extension badge (pdf / jpg / png)
   - Inline preview:
     - PDF → `<iframe>` at ~h-64 with the signed URL
     - Image (jpg/png/webp/heic→fallback) → `<img>` thumbnail, click to open full
     - Other → just a "View attachment" button
   - "Open in new tab" / "Download" button that uses the signed URL
4. Handle the empty state: show a muted "No attachment provided" line so admins know whether the driver uploaded one.
5. Keep the access gate (`isOwner || hasRole('payroll_admin')`) — no other roles ever see the attachment, matching the existing banking gate and storage policy.

## Out of scope
- No new database fields, RPCs, or policies.
- No changes to the onboarding upload flow itself.
- No re-exposure of the attachment to safety or dispatcher roles.
