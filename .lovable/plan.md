# Fix "Failed to fetch" from the embedded Gusto SDK

## What's happening

Provisioning succeeded — the UI shows the company as **Provisioned**. The red "Error while rendering SDK component: Unable to make request: TypeError: Failed to fetch" is thrown by `<Payroll.PayrollFlow>` from `@gusto/embedded-react-sdk`.

`GustoAppProvider` points the SDK at our edge function:

```
baseUrl = `${SUPABASE_URL}/functions/v1/run-w2-payroll`
```

The SDK then issues normal Gusto REST calls against that base, e.g.:

```
GET  {baseUrl}/v1/companies/{uuid}/payrolls
POST {baseUrl}/v1/companies/{uuid}/payrolls/{id}
```

But `run-w2-payroll` is an **action-RPC** endpoint. It only understands `POST { action: "provision_company" | "sync_employee" | ... }`. Every SDK call falls through to a 400 / 404 (or gets blocked at the CORS preflight because we only advertise `POST, OPTIONS` and don't handle arbitrary paths), which the SDK surfaces as `TypeError: Failed to fetch`.

## Fix

Add a transparent passthrough proxy inside `run-w2-payroll` that forwards any request whose path continues past the function root (i.e. anything starting with `/v1/…`) upstream to Gusto, using the current org's stored company access token — so the SDK can talk to Gusto through our edge without ever seeing credentials.

## Technical details

Edit `supabase/functions/run-w2-payroll/index.ts`:

1. **Route split at the top of the handler.** After the OPTIONS preflight, parse `url.pathname`. Strip the `/functions/v1/run-w2-payroll` prefix. If the remaining path is empty or `/`, keep the existing action-RPC branch. If it starts with `/v1/`, run the new proxy branch.

2. **Proxy branch.**
   - Authenticate the caller the same way the RPC branch does (Supabase JWT → `orgId`, role check for owner / payroll_admin; driver-only routes stay on RPC).
   - Resolve the org's `company_uuid` + a valid company access token via the existing `getAccessToken` / `refreshTokens` helpers (already implemented). Reject with 409 if the org isn't provisioned yet.
   - Build the upstream URL: `${GUSTO_BASE}${remainingPath}${url.search}`.
   - Forward `method`, streamed `body`, and a safe subset of headers (`Content-Type`, `Accept`, `X-Gusto-API-Version`). Replace `Authorization` with `Bearer <company access token>`. Never forward the caller's JWT.
   - Return the upstream response verbatim (status, body) plus our CORS headers.

3. **CORS.** Update `corsFor` to allow `GET, POST, PUT, PATCH, DELETE, OPTIONS` and to echo the request's `Access-Control-Request-Headers` so the SDK's preflights succeed.

4. **Safety.** Only proxy paths that begin with `/v1/`; anything else → 404. Never proxy `/oauth/*` or `/v1/partner_managed_companies` from the browser — those stay server-only inside the RPC actions.

5. **No client changes.** `GustoAppProvider`'s `baseUrl` stays as-is; the SDK now finds a working REST surface at that base.

## Out of scope

- No changes to provisioning, token refresh, or the RPC actions themselves — those already work (company is "Provisioned").
- No database schema changes.
