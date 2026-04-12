

## Carrier Document Hub — Real Storage, Real Email, No Mock Data

### Three changes requested

1. **Use native storage only** for carrier packet document uploads (bypass Google Drive even if configured)
2. **Remove all mock/hardcoded data** — documents are fetched from the `documents` table
3. **Send carrier packet email via Resend** using the same pattern as the existing `send-invoice-email` edge function

---

### 1. Database migration — expand document_type constraint

Add carrier packet document types to the existing `documents_document_type_check` constraint:
- `W-9`, `MC Authority`, `COI`, `NOA`

### 2. Create `send-carrier-packet` edge function

A new edge function modeled after `send-invoice-email`:
- Authenticates the caller, resolves their org
- Accepts: `recipientEmail`, `message`, `documentIds[]` (the selected carrier docs)
- Fetches the document records from `documents` table (with org_id check)
- For each selected document, generates a short-lived signed URL from native storage
- Builds an HTML email with the user's message and download links for each attached document
- Sends via Resend (same `RESEND_API_KEY` secret, same `no-reply@jeanwayusa.com` sender)
- Returns success/failure

### 3. Rewrite `CarrierDocumentHub.tsx` — real data, native uploads

**Document grid:**
- Query `documents` table where `related_type = 'carrier_packet'` and `document_type` in `['W-9', 'MC Authority', 'COI', 'NOA']`
- For each of the 4 document types, show the card with real status:
  - If a document exists → show file name, upload date, Preview/Update buttons
  - If no document exists → show "Missing" badge with Upload button
- Upload uses `supabase.storage.from('documents').upload(...)` directly (native, not through `useStorageProvider`) to ensure files are always in built-in storage
- Insert a `documents` row with `related_type: 'carrier_packet'`, appropriate `document_type`
- Preview uses `DocumentViewer` with the stored path

**Quick Send section:**
- Checkboxes only show document types that have been uploaded (can't attach missing docs)
- Send button calls `supabase.functions.invoke('send-carrier-packet', { body: { ... } })`
- Shows loading state and success/error toast

### 4. Files to create/modify

| File | Action |
|------|--------|
| DB migration | Add `W-9`, `MC Authority`, `COI`, `NOA` to document_type check |
| `supabase/functions/send-carrier-packet/index.ts` | Create — Resend-based email sender |
| `src/components/crm/CarrierDocumentHub.tsx` | Rewrite — real storage + real email |

### Technical notes
- Native storage is enforced by calling `supabase.storage.from('documents').upload()` directly instead of going through `useStorageProvider` (which would route to Google Drive if configured)
- Signed URLs for email download links are generated server-side in the edge function using service role
- No file attachments in email (Resend limit / best practice) — download links instead
- The org's `related_id` for carrier packet docs will be the org_id itself since these are org-level documents

