Refactor `supabase/functions/invite-user/index.ts` to use the new shared email template.

## Changes

1. **Import**: Add `import { buildFleetFlowEmail } from '../_shared/email-template.ts'` at the top.

2. **Fetch org name**: After resolving `orgId` from the requester's profile (around line 121), query `organizations` by `id = orgId` and select `name`. Default fallback to `"your organization"` if missing.

3. **Existing-user email**: Replace the hand-rolled `existingUserHtml` block (lines 243–301) with a `buildFleetFlowEmail({...})` call:
   - `previewText`: `Accept your invitation to join ${orgName}`
   - `headline`: `You've been invited to join ${orgName}`
   - `bodyText`: `You have been invited to join ${orgName} as a ${roleLabels[role]} on the FleetFlow TMS platform. Log in to accept the invitation and switch to this organization.`
   - `buttonText`: `Review Invitation`
   - `buttonUrl`: `acceptLink`
   - `footerContext`: `This invitation expires in 14 days. If you weren't expecting it, you can safely ignore this email.`
   - Update subject to `You've been invited to join ${orgName} on FleetFlow TMS`.

4. **New-user email**: Replace the `emailHtml` block (lines 487–556) with a `buildFleetFlowEmail({...})` call:
   - `previewText`: `You've been invited to join ${orgName} on FleetFlow TMS`
   - `headline`: `You've been invited to join ${orgName}`
   - `bodyText`: `You have been invited to join ${orgName} as a ${roleLabels[role]} on the FleetFlow TMS platform. Click the button below to accept your invitation and set up your account.`
   - `buttonText`: `Accept Invitation`
   - `buttonUrl`: `signUpLink`
   - `footerContext`: `If you weren't expecting this invitation, you can safely ignore this email.`
   - Update subject to `You've been invited to join ${orgName} on FleetFlow TMS`.

5. Resend `from` address and all other logic (auth checks, role assignment, driver linking, response shape) remain unchanged.

No DB schema changes. No new dependencies.