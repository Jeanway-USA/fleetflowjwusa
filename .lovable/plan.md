# Fix invite redirect URL using request Origin

## Problem
`supabase/functions/invite-user/index.ts` line 122 hardcodes:
```ts
const appUrl = 'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app';
```
This URL is then used to build the invite `acceptUrl` (`${appUrl}/auth/accept-invite`) passed as `redirectTo` to `supabase.auth.admin.generateLink`. Result: every invite email lands on the preview domain regardless of where the owner sent it from (e.g. `tms.jeanwayusa.com`).

## Fix
Derive `appUrl` from the request `Origin` header (which is already validated by the CORS allowlist earlier in the function), and fall back to the production custom domain if the origin is missing.

### Edit `supabase/functions/invite-user/index.ts`
Replace the hardcoded `appUrl` with:
```ts
const FALLBACK_APP_URL = 'https://tms.jeanwayusa.com';
const requestOrigin = req.headers.get('Origin') || '';
const isValidOrigin =
  requestOrigin &&
  (ALLOWED_ORIGINS.includes(requestOrigin) ||
    requestOrigin.endsWith('.lovable.app') ||
    requestOrigin.endsWith('.lovableproject.com'));
const appUrl = isValidOrigin ? requestOrigin : FALLBACK_APP_URL;
```
No other changes — `acceptUrl` and `redirectTo` already use `appUrl`, and the branded invite email body uses the same variable.

### Redeploy
Deploy `invite-user` after the edit.

## Out of scope
- No DB/config changes.
- No changes to other edge functions (their redirect logic, if any, can be audited separately if needed).
- Supabase Auth's "Site URL" / "Redirect URLs" allowlist must already include `https://tms.jeanwayusa.com/auth/accept-invite` (and the preview URL). If invites still bounce after this fix, that allowlist is the next thing to check.
