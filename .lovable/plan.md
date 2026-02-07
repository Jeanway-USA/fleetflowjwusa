
## Plan: Fix Home Time Submissions, Add Date Selection, Enable Notification Clearing

### Overview
Three targeted fixes for the driver experience:
1. Fix home time request submissions by improving error handling and removing the type cast
2. Add start/end date selection to Home Time and PTO request forms
3. Allow drivers to clear their notifications (currently blocked by a missing database policy)

---

### Part 1: Fix Home Time Request Submission

**Root Cause:** The form uses `insertData as any` to bypass TypeScript type checking, and the error toast shows a generic "Failed to submit request" message that hides the actual database error. This makes debugging impossible for both developers and users.

**File: `src/components/driver/DriverRequestForm.tsx`**
- Remove the `Record<string, unknown>` and `as any` type cast -- use the proper Supabase Insert type instead so TypeScript catches issues at compile time
- Show the actual error message in the toast (e.g., `toast.error('Failed to submit: ' + error.message)`) so drivers and support can see what went wrong
- Add a pre-submission check that validates `driverId` is present before attempting the insert

---

### Part 2: Add Date Selection for Home Time and PTO

Drivers currently type dates into the subject line ("Home time Feb 14-16") which is unstructured and hard to process. Adding proper date fields gives dispatchers accurate, machine-readable dates.

**Database Migration:**
- Add `start_date` (date, nullable) column to `driver_requests`
- Add `end_date` (date, nullable) column to `driver_requests`
- Both are nullable since detention and maintenance requests don't need dates

**File: `src/components/driver/DriverRequestForm.tsx`**
- Add `startDate` and `endDate` state variables (type `Date | undefined`)
- When request type is `home_time` or `pto`, show two date pickers below the subject line:
  - "Start Date" picker
  - "End Date" picker  
- Use the existing Shadcn Calendar + Popover pattern (with `pointer-events-auto` class for proper interaction inside the bottom sheet)
- Disable past dates on the calendar
- Include `start_date` and `end_date` in the insert payload (formatted as ISO date strings)
- Add validation: if type is `home_time` or `pto`, require at least a start date

**File: `src/components/driver/DriverRequestsCard.tsx`**
- When displaying pending/recent requests of type `home_time` or `pto`, show the date range below the subject if dates are present (e.g., "Feb 14 - Feb 16")

**File: `src/components/dispatcher/DispatcherAlerts.tsx`**
- Display the requested date range in the alert detail view so the dispatcher sees when the driver wants off

---

### Part 3: Enable Notification Clearing

**Root Cause:** The `driver_notifications` table only has SELECT and UPDATE policies for drivers -- there is no DELETE policy. When a driver tries to delete a notification, the database silently blocks it.

**Database Migration:**
- Add a DELETE policy: `Drivers can delete their own notifications` with condition `driver_id = get_driver_id_for_user(auth.uid())`

**File: `src/components/driver/DriverNotifications.tsx`**
- Add a "Clear all" button in the notification header (next to "Mark all read") that deletes all notifications for the driver
- Add a swipe-to-dismiss or small X button on individual notifications for single deletion
- Add confirmation before clearing all notifications
- Both use `supabase.from('driver_notifications').delete().eq('driver_id', driverId)` which will now work with the new RLS policy

---

### Technical Summary

| Action | File | Details |
|--------|------|---------|
| Migration | New SQL migration | Add `start_date` and `end_date` to `driver_requests`; add DELETE policy on `driver_notifications` |
| Modify | `src/components/driver/DriverRequestForm.tsx` | Fix type cast, improve error messages, add date pickers for home_time/pto |
| Modify | `src/components/driver/DriverRequestsCard.tsx` | Display date range on home_time/pto requests |
| Modify | `src/components/dispatcher/DispatcherAlerts.tsx` | Show requested dates in alert details |
| Modify | `src/components/driver/DriverNotifications.tsx` | Add clear all and individual delete buttons |
