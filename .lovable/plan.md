## Goal
Make payroll onboarding steps immediately show as completed after their information saves successfully, instead of remaining Pending while the backend provider has accepted the data.

## What I’ll change
1. **Backend completion signals**
   - In `run-w2-payroll`, after successful signatory save, update the organization’s cached payroll setup status (`signatory_status = completed`) and trigger/sync onboarding steps when possible.
   - Apply the same pattern to federal tax details/state tax saves where the data has been accepted but the remote onboarding step may lag.

2. **Frontend status calculation**
   - Update the employer onboarding portal to treat a step as complete if either:
     - the live onboarding step says `completed`, or
     - the backend’s cached status for that setup area is `completed` after a successful save.
   - Keep the Refresh button behavior so live provider status can still override/update cached status.

3. **Query invalidation after saves**
   - Ensure successful saves invalidate/refetch the onboarding status query so the badge changes from Pending/Done without a page reload.

4. **Safety checks**
   - Keep failures surfaced as errors; only mark complete after the save endpoint returns success.
   - Preserve tenant-scoped updates by `org_id` and do not expose sensitive tax/signatory fields to the client beyond existing form data.

## Expected result
When Signatory or Federal Tax Details save successfully, the toast and the accordion badge should agree: the step should move from **Pending** to **Done** promptly instead of appearing unsaved.