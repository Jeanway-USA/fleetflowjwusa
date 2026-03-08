

## Deactivated Organization Gate

### Problem
When an org's `is_active` is set to `false` in the super admin dashboard, users can still access the TMS. There's no gate or dedicated page informing them.

### Solution
1. **Track `is_active` in AuthContext** — fetch and expose `orgIsActive` from the `organizations` table (already queried, just not stored).

2. **Create `/account-deactivated` page** — a full-screen page (no sidebar) showing:
   - Clear message that the organization has been deactivated
   - Explanation of possible reasons (non-payment, admin action, trial expiry)
   - Three action buttons:
     - **Delete My Account** — calls a new self-delete variant of the `delete-user` edge function (current one blocks self-deletion; we'll add a `delete-own-account` function or a `selfDelete` flag)
     - **Contact Support** — mailto link or info
     - **Reactivate Subscription** — navigates to `/pricing` or a contact form

3. **Gate in `RoleBasedRedirect`** — after confirming user has an org, check `orgIsActive`. If `false`, redirect to `/account-deactivated`.

4. **Gate in `ProtectedRoute`** — same check so direct URL access is also blocked.

5. **New edge function `delete-own-account`** — allows an authenticated user to delete their own auth account, profile, and roles (the existing `delete-user` explicitly prevents self-deletion).

### Files Modified
| File | Change |
|---|---|
| `src/contexts/AuthContext.tsx` | Store and expose `orgIsActive` from the org query |
| `src/pages/AccountDeactivated.tsx` | New full-screen deactivated page with actions |
| `src/components/shared/RoleBasedRedirect.tsx` | Redirect to `/account-deactivated` when `!orgIsActive` |
| `src/components/shared/ProtectedRoute.tsx` | Redirect to `/account-deactivated` when `!orgIsActive` |
| `src/App.tsx` | Add `/account-deactivated` route |
| `supabase/functions/delete-own-account/index.ts` | New edge function for self-account-deletion |

### Technical Details
- `fetchOrgData` already queries `organizations` — just add `is_active` to the select and store it in state
- The deactivated page will use the existing `signOut` from AuthContext
- `delete-own-account` edge function: validates JWT, deletes `user_roles`, `profiles`, then `auth.admin.deleteUser(uid)` for the requesting user's own ID
- No database migration needed

