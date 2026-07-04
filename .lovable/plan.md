Implement the Gusto Embedded System Access Token flow in the payroll provisioning path.

Plan:
1. Update `run-w2-payroll` token helpers
   - Remove all reads/fallbacks/checks for `GUSTO_PARTNER_ACCESS_TOKEN`.
   - Add a `getGustoSystemToken()` helper that validates `GUSTO_CLIENT_ID` and `GUSTO_CLIENT_SECRET`, then POSTs to `${GUSTO_BASE}/oauth/token` with:
     - `client_id`
     - `client_secret`
     - `grant_type: "system_access"`
   - Use the returned `access_token` only in memory for the immediate system-level request.

2. Update company provisioning
   - Before calling `/v1/partner_managed_companies`, call `getGustoSystemToken()`.
   - Send `Authorization: Bearer <temporary system token>` to Gusto.
   - Add `Accept: application/json` and `X-Gusto-API-Version` headers for the modern endpoint.
   - Keep storing only the returned company-level `access_token`, `refresh_token`, expiry, and `company_uuid` for later company/employee/payroll operations.

3. Keep company-level OAuth behavior intact
   - Preserve `gusto_get_tokens`, `gusto_set_tokens`, `refreshTokens`, and `gustoFetch` for company-level API calls after provisioning.
   - Remove the old fallback where missing company tokens silently use the partner token; company-level calls should fail clearly if company OAuth tokens are not present.

4. Database schema cleanup
   - Confirm no table/function stores `GUSTO_PARTNER_ACCESS_TOKEN` directly; the current `gusto_integration` schema stores company-level tokens only, so it should remain.
   - If any lingering static partner token config is found during implementation, add a safe migration to remove that obsolete dependency without touching company token storage.

5. Validate
   - Re-scan the codebase for `GUSTO_PARTNER_ACCESS_TOKEN` to ensure the backend no longer requires it.
   - Run a targeted type/lint check for the changed edge function path if available.
   - Verify the provisioning error path now references missing/failed System Access Token credentials instead of the obsolete partner token.