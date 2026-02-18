
## Fix: "Failed to import expenses" after statement parsing

### Problem
The `StatementUpload` component inserts and updates rows in the `expenses` table without including `org_id` in the payload. The RLS policy on `expenses` requires `org_id = get_user_org_id(auth.uid())` via its `WITH CHECK` clause, so the database rejects the mutation.

### Solution
Pass `org_id` from the `useAuth()` hook into the `StatementUpload` component and include it in every insert and update payload.

### Technical Details

**File: `src/pages/Finance.tsx`**
- Import `useAuth` (if not already imported) and destructure `orgId`
- Pass `orgId` as a prop to `<StatementUpload orgId={orgId} />`

**File: `src/components/finance/StatementUpload.tsx`**
- Add `orgId: string | null` to `StatementUploadProps`
- In the insert payload (line ~311-322), add `org_id: orgId`
- In the update payload (line ~331-342), add `org_id: orgId`

This follows the same pattern used throughout the codebase per the multi-tenant RLS architecture.
