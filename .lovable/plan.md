
# Fix: Document Upload RLS Error + False Onboarding Redirect

## Issue 1: Document Upload Fails with RLS Error

The `/documents` page insert is missing `org_id`. The RLS policy requires `org_id = get_user_org_id(auth.uid())`.

### File: `src/pages/Documents.tsx`
- Import `useAuth` and destructure `orgId`
- Add `org_id: orgId` to the document insert payload (line ~86-93)

Also fix the shared hook:

### File: `src/hooks/useDocumentUpload.ts`
- Import `useAuth` and destructure `orgId`
- Add `org_id: orgId` to the document insert payload in `uploadDocument`

---

## Issue 2: Signed-In Users Redirected to Onboarding

The `AuthContext` sets `loading = false` before `fetchOrgData` finishes. So `RoleBasedRedirect` sees `orgId === null` and redirects to `/onboarding` even for users who already have an org.

### File: `src/contexts/AuthContext.tsx`
- Add a new state: `orgLoading` (default `true`)
- Set `orgLoading = false` only after `fetchOrgData` completes (in both `onAuthStateChange` and `getSession` code paths)
- When no user, set `orgLoading = false`
- Expose `orgLoading` in the context

### File: `src/components/shared/RoleBasedRedirect.tsx`
- Destructure `orgLoading` from `useAuth()`
- Add `orgLoading` to the loading check: `if (loading || rolesLoading || orgLoading)`

This ensures the redirect to `/onboarding` only happens after org data has been fully fetched, preventing the false redirect.

---

## Summary

| File | Change |
|------|--------|
| `src/pages/Documents.tsx` | Add `org_id` to document insert |
| `src/hooks/useDocumentUpload.ts` | Add `org_id` to document insert |
| `src/contexts/AuthContext.tsx` | Add `orgLoading` state, set false after `fetchOrgData` completes |
| `src/components/shared/RoleBasedRedirect.tsx` | Wait for `orgLoading` before redirecting |
