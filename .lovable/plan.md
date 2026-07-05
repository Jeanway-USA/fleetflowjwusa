## Add "Send onboarding invite" action to W-2 Driver Sync

Right now the dashboard shows `Forms pending` once a driver is synced to Gusto, but there's no in-app trigger to actually get the driver to sign their W-4 / I-9. This plan adds that trigger.

### Approach
Use Gusto's employee self-onboarding flow: the backend asks Gusto to email the driver a secure link where they complete and e-sign W-4 and I-9 themselves. We surface a **"Send onboarding invite"** button per row (and a bulk action) in `W2DriverSyncDashboard`. When the driver finishes in Gusto, the existing onboarding-status query flips the badge to `Forms complete`.

### Edited files

**`supabase/functions/run-w2-payroll/index.ts`**
- New action `send_employee_onboarding_invite`:
  - Input: `{ driver_id }` (server looks up `gusto_employee_id` from `drivers`).
  - Ensures the employee has `self_onboarding = true` (PUT `/v1/employees/{uuid}` if not already), then calls Gusto's self-onboarding invite endpoint to email the driver.
  - Returns `{ sent: true, email }` on success; surfaces Gusto's error verbatim on failure (missing email, employee already onboarded, etc.).
- New action `get_employee_onboarding_link` (fallback): returns a one-time onboarding URL for the admin to copy/share when email isn't viable.
- Both actions are org-scoped through the same auth guard as the existing `sync_employee` action — no new RLS surface.

**`src/services/gustoCompanyApi.ts`**
- `sendEmployeeOnboardingInvite(driverId)` wrapper.
- `getEmployeeOnboardingLink(driverId)` wrapper.

**`src/components/payroll/W2DriverSyncDashboard.tsx`**
- Add a per-row **"Send invite"** button, visible only when the driver is synced AND doc status is `pending` or `unknown`. Shows a spinner while sending, toast on result, and disables briefly after success ("Invite sent").
- Add a small "Copy link" dropdown item beside it that calls `getEmployeeOnboardingLink` and copies the URL to clipboard.
- Add a table-level **"Send invite to all pending"** button in the card header that iterates all `pending`/`unknown` rows sequentially with a progress toast.
- Empty-email guard: if `driver.email` is null, disable the button with a tooltip ("Add an email to this driver first").
- After sending, `onboardingQuery.refetch()` is called after ~2s so the badge updates once Gusto reflects the invite.

### Explicitly NOT doing
- No in-app W-4 / I-9 rendering or e-sign flow — signing continues to happen inside Gusto, which is the compliant path.
- No changes to `DriverSettlementsTab`, no new tables, no migrations.
- No auto-send on sync — invites remain an explicit admin action to avoid surprise emails.

### Technical notes
- Gusto endpoint used: `POST /v1/employees/{employee_uuid}/onboarding_status` transition to `self_onboarding_pending_invite` + `POST /v1/employees/{employee_uuid}/send_offer_letter`-style invite. Exact path is `/v1/employees/{uuid}/onboarding_invitation` in Embedded; the edge function will handle the version differences and normalize the response.
- If Gusto returns `employee_onboarding_status: 'onboarding_completed'` the client action returns early with an informational toast instead of re-inviting.
- Rate limiting: bulk send waits 400ms between calls to stay under Gusto's per-second limits.
