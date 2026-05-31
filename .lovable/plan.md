## Problem
"Failed to send a request to the Edge Function" when deleting a member from `tms.jeanwayusa.com`.

Root cause: `supabase/functions/delete-user/index.ts` CORS allowlist only contains the preview URL and localhost — it's missing `https://tms.jeanwayusa.com` and `https://fleetflowjwusa.lovable.app`. When the live site calls the function, the response's `Access-Control-Allow-Origin` is set to the preview URL, so the browser blocks it.

## Fix
Add the production origins to `ALLOWED_ORIGINS` in `supabase/functions/delete-user/index.ts`, matching the same allowlist used by `invite-user` and `contact-form`:

```ts
const ALLOWED_ORIGINS = [
  'https://tms.jeanwayusa.com',
  'https://fleetflowjwusa.lovable.app',
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];
```

Redeploy `delete-user`.

## Out of scope
- No other edge functions changed in this step. If other functions show the same symptom from the custom domain, they need the same allowlist update — can be audited in a follow-up.
