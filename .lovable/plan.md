## Problem

"Failed to send a request to the Edge Function" appears when inviting from the live site (`https://tms.jeanwayusa.com`). Edge logs show only an `OPTIONS` preflight reaching `invite-user` — the follow-up `POST` is blocked by the browser.

## Root cause

`supabase/functions/invite-user/index.ts` builds `Access-Control-Allow-Origin` from a small allowlist:

```ts
const ALLOWED_ORIGINS = [
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];
// allowed if origin matches OR ends with .lovable.app / .lovableproject.com
```

The custom domain `tms.jeanwayusa.com` (and the published `fleetflowjwusa.lovable.app` works via the `.lovable.app` suffix, but the custom domain does not). The preflight still returns 200, but with `Access-Control-Allow-Origin` set to the fallback preview URL — which doesn't match the request origin, so the browser refuses to send the POST and surfaces the generic "Failed to send a request to the Edge Function".

## Fix

Add the production custom domain(s) to the allowlist in `supabase/functions/invite-user/index.ts`:

```ts
const ALLOWED_ORIGINS = [
  'https://tms.jeanwayusa.com',
  'https://fleetflowjwusa.lovable.app',
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];
```

Keep the existing `.lovable.app` / `.lovableproject.com` suffix checks so preview URLs continue to work. No other logic changes.

## Out of scope

Auditing every other edge function for the same allowlist gap. Happy to do that as a follow-up if you want — but this plan only fixes `invite-user` to unblock the reported error.
