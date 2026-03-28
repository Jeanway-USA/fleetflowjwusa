

## Fix: Work Order Completion Fails Due to Storage RLS

### Problem
The `CompleteJobModal` uploads invoice files to `invoices/${fileName}` in the `documents` storage bucket. But the storage RLS policy requires the first folder segment to be the user's `org_id` (e.g., `${org_id}/invoices/${fileName}`). This causes a "new row violates row-level security policy" error.

### Solution
Update the upload path in `CompleteJobModal.tsx` to prefix with the user's org_id.

### Changes

| File | Change |
|------|--------|
| `src/components/maintenance/CompleteJobModal.tsx` | Fetch the user's profile to get `org_id`, then change the upload path from `invoices/${fileName}` to `${org_id}/invoices/${fileName}` |

### Detail
In `CompleteJobModal.tsx`, before the upload:
1. Get the current user's session via `supabase.auth.getUser()`
2. Fetch their `org_id` from `profiles`
3. Use `${orgId}/invoices/${fileName}` as the storage path

This matches the existing pattern used in other upload components (e.g., `ProofOfDeliveryDialog`, `useDocumentUpload`).

