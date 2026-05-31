## Problem
Invite emails are still landing on `id-preview--…lovable.app/auth/accept-invite` instead of `tms.jeanwayusa.com/auth/accept-invite`.

Root cause: in the previous fix, `appUrl` is derived from the request `Origin` header. When an owner sends an invite while working inside the Lovable preview (or the editor iframe posts the request from the preview origin), the origin is the preview URL, so `redirectTo` becomes the preview URL and the recipient lands there.

The `redirectTo` value must always be the production custom domain regardless of where the owner happens to click "Invite" from — recipients should never be routed to preview/editor URLs.

## Fix
In `supabase/functions/invite-user/index.ts`, stop deriving `appUrl` from the request `Origin`. Always use the production custom domain for the invite link.

Replace the current block:
```ts
const FALLBACK_APP_URL = 'https://tms.jeanwayusa.com';
const requestOrigin = req.headers.get('Origin') || '';
const isValidOrigin = ...;
const appUrl = isValidOrigin ? requestOrigin : FALLBACK_APP_URL;
```
with:
```ts
// Invite links must ALWAYS point to the production custom domain,
// regardless of where the owner sent the invite from (preview, editor,
// localhost). Recipients should never land on a preview URL.
const appUrl = 'https://tms.jeanwayusa.com';
```

`acceptUrl`, `redirectTo`, and the branded email button already use `appUrl`, so no other code changes are needed.

Redeploy the `invite-user` edge function.

## Out of scope
- CORS allowlist stays as-is (still needed so the owner's browser can call the function from preview/custom domain).
- No DB or auth-config changes. The Supabase Auth "Redirect URLs" allowlist must already include `https://tms.jeanwayusa.com/auth/accept-invite`. If invites still bounce after this fix, that allowlist is the next thing to check.
- The "Email link is invalid or has expired" error in the screenshot is a separate, expected condition (the link was already consumed or expired); this plan only addresses the wrong-domain issue.
