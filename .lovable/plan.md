

## Fix: POD Documents Not Visible + Morning Briefing Query Mismatch

### Problem 1: POD documents inserted without `org_id`
The `ProofOfDeliveryDialog` inserts into the `documents` table without `org_id`. RLS requires `org_id` to match the user's org, so these rows are invisible to all queries. The `useDocumentUpload` hook correctly includes `org_id` but the POD dialog does its own manual insert.

### Problem 2: Morning Briefing checks wrong `document_type`
The MorningBriefingWidget queries for `document_type = 'pod'` but POD documents are stored as `'pod_signature'` and `'transflo_pod'`.

### Solution

| File | Change |
|------|--------|
| `src/components/driver/ProofOfDeliveryDialog.tsx` | Add `org_id: profile?.org_id` to the document insert objects (lines 72-79 and 84-91). Move the profile fetch earlier so it's available for both inserts. |
| `src/components/executive/MorningBriefingWidget.tsx` | Line 91: change `.eq('document_type', 'pod')` to `.in('document_type', ['pod_signature', 'transflo_pod'])` |
| Migration SQL | Backfill existing POD documents missing `org_id`: `UPDATE documents SET org_id = fl.org_id FROM fleet_loads fl WHERE fl.id = documents.related_id AND documents.related_type = 'load' AND documents.org_id IS NULL AND documents.document_type IN ('pod_signature', 'transflo_pod');` |

