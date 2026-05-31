## Problem

Onboarding submission fails at the final step ("Failed to submit documents"). The driver uploads a voided check, the file lands in storage and a row is inserted into `driver_signed_documents`, but then `DriverOnboarding.tsx` runs:

```ts
supabase.from('drivers')
  .update({ direct_deposit_attachment_url: attachmentPath })
  .eq('id', driverRow.id);
```

The `drivers_self_update_guard` trigger added in the last migration explicitly forbids drivers from changing `direct_deposit_attachment_url` on their own row, so the update raises and the catch block shows the toast.

## Fix

Recreate `public.prevent_driver_self_sensitive_update()` and remove `direct_deposit_attachment_url` from the blocked-column list. Drivers will still be blocked from changing pay, status, identity, hire date, org/user assignment, name, and avatar — only the direct-deposit attachment they just uploaded becomes self-writable, matching the onboarding flow.

No client code changes; the existing onboarding update call works as-is once the trigger is relaxed.

## Technical detail

Single migration: `CREATE OR REPLACE FUNCTION public.prevent_driver_self_sensitive_update()` with the same SECURITY DEFINER body, minus `direct_deposit_attachment_url` from the IF check. Trigger binding stays the same.
