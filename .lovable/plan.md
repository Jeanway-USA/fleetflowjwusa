## Goal
Make `tms.jeanwayusa.com` an explicit entry on every edge function's CORS allowlist, replacing wildcard `*` where appropriate so the custom domain is always listed.

## Standard allowlist
Reuse the exact pattern already used by `invite-user`, `delete-user`, etc.:

```ts
const ALLOWED_ORIGINS = [
  'https://tms.jeanwayusa.com',
  'https://fleetflowjwusa.lovable.app',
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    origin === allowed ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}
```
Each response (including error responses) uses `getCorsHeaders(req)` instead of the static `corsHeaders` constant.

## Already compliant — no changes
`check-pm-schedules`, `contact-form`, `create-checkout-session`, `create-portal-session`, `delete-user`, `invite-user`, `parse-landstar-statement`.

## Convert from wildcard `*` to strict allowlist
These are auth-gated or user-triggered from the app; wildcard isn't needed:
- `delete-own-account`
- `email-load-status`
- `google-drive-auth`
- `landstar-fuel-stops`
- `manage-credentials`
- `parse-rate-confirmation`
- `send-carrier-packet`
- `send-invoice-email`
- `storage-proxy`
- `demo-login`
- `demo-switch-tier`

For each, replace the `const corsHeaders = { 'Access-Control-Allow-Origin': '*', ... }` block with the per-request `getCorsHeaders(req)` helper above, and swap every `corsHeaders` usage for the helper's return value (one `const corsHeaders = getCorsHeaders(req);` at the top of the handler).

## Intentional wildcard (no change)
- `public-load-tracker` — shareable public tracking endpoint; must accept any origin.
- `discord-updates` — invoked by Discord/webhooks, not a browser; wildcard kept for the OPTIONS handler.

## Verification
After deploy, from `tms.jeanwayusa.com`:
- Trigger Settings → Delete member (covered already).
- Trigger flows that hit converted functions: storage-proxy (file previews), send-invoice-email, manage-credentials, etc. Confirm no "Failed to send a request to the Edge Function" / CORS errors in browser console.

## Out of scope
- No business-logic changes inside the functions.
- No DB or auth-config changes.
- `public-load-tracker` stays wildcard by design.
