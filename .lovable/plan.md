## Root cause

In `StartingOdometerDialog` and `EndingOdometerDialog`, the submit flow does:

1. `applyOptimistic(...)` — patches the cache to `in_transit`/`delivered` and `cancelQueries`.
2. `onComplete()` — which on the Driver Dashboard is `refetchLoads()`.
3. Closes the dialog.
4. Fires the `supabase.update(...)` in the background.

Step 2 calls `useQuery`'s `refetch()`, which **bypasses** the just-issued `cancelQueries` and kicks off a fresh server read **before** step 4's DB write has landed. That read returns the row with its old `pending`/`assigned` status, which then clobbers the optimistic patch in cache.

User-visible effect: dialog closes, the load briefly shows the new status, then snaps back to the old status. Driver taps "Start Load" / "Complete Load" again, the (now empty) dialog reopens, and they have to retype the odometer. On the second attempt the background write from the first submit has usually finished, so it sticks — hence "have to enter twice."

## Fix

Stop calling the parent's refetch in the middle of the optimistic flow. The optimistic patch already updates the UI instantly, and `commit()` invalidates the relevant queries after the DB write succeeds, which triggers the correct refetch.

### `src/components/driver/StartingOdometerDialog.tsx`
- Remove the early `onComplete()` call that sits between `applyOptimistic(...)` and the `supabase.update(...)`.
- Keep `onComplete()` in the offline branch (no optimistic patch there; the parent needs the nudge).
- Add a single `onComplete()` call after `commit()` so any non–driver-loads consumers still re-sync (cheap; `commit()` already invalidates the driver-loads caches, so this just covers other listeners).
- Also flip `setIsSubmitting(true)` at the start of `handleSubmit` and clear it in a `finally` — currently it is never set, so the "Saving…" state never shows and double-taps on the submit button can fire twice.

### `src/components/driver/EndingOdometerDialog.tsx`
- Same three changes (remove early `onComplete()` in the optimistic path, keep it in the offline path, add post-commit `onComplete()`, wire `setIsSubmitting` for real).

### No changes needed
- `ActiveLoadCard.tsx` / `DriverLoadsView.tsx` callers stay the same — `onComplete` keeps the same signature, just gets called later.
- `useOptimisticLoadStatus.ts` is correct; it already cancels queries and invalidates on commit.

## Out of scope
- POD dialog, status progression for non-odometer transitions, and the offline-queue path itself.
