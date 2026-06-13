## Goal
Make every driver-side load-status mutation feel instant on flaky cell connections by applying React Query optimistic updates with automatic rollback + a friendly retry toast on failure.

## Mutations in scope
All write paths triggered from the Driver Load View:
1. `ActiveLoadCard.handleProgressStatus` — intermediate transitions: `pending → assigned`, `assigned → loading`.
2. `StartingOdometerDialog.handleSubmit` — `loading → in_transit` + `start_miles`.
3. `EndingOdometerDialog.handleSubmit` — `in_transit → delivered` + `end_miles` (+ `actual_miles`).
4. `ProofOfDeliveryDialog.handleSubmit` — `in_transit → delivered` + `end_miles` (+ `actual_miles`, `pod_signature_path`, `pod_transflo_link`, optional `notes`). The signature upload / document inserts stay sequential since they must complete server-side; only the status flip is treated optimistically (load already moves on the UI; the dialog still shows a spinner only briefly).

The offline path (already handled by `useOfflineQueue`) is preserved unchanged.

## Pattern (shared)

Use the existing `useQueryClient` and operate on cache entries matching the active-load query keys:
- `['driver-active-loads', driverId]` (driver dashboard)
- `['driver-loads', ...]` (driver loads list view — apply with `predicate` so we cover both screens)

For each mutation:

```text
1. snapshot = queryClient.getQueriesData({ predicate: matchesDriverLoads })
2. queryClient.cancelQueries({ predicate })
3. queryClient.setQueriesData({ predicate }, (old) => patch load by id with new fields)
4. close dialog + call onComplete (UI now shows new status immediately)
5. await supabase update
   - success → toast.success(...), invalidate queries to reconcile
   - failure → restore snapshot via setQueriesData, toast.error('Network error. Please try again when you have a better signal.')
```

Helper extracted to `src/hooks/useOptimisticLoadStatus.ts` exposing `applyOptimistic(loadId, patch)` returning `{ commit, rollback }`. Keeps the four call sites tiny and consistent.

## File changes

1. **New** `src/hooks/useOptimisticLoadStatus.ts`
   - Wraps `useQueryClient`.
   - `matchesDriverLoads`: `key[0] === 'driver-active-loads' || key[0] === 'driver-loads'`.
   - `applyOptimistic(loadId, patch)`:
     - snapshots matching queries,
     - cancels in-flight refetches,
     - mutates each cached array by mapping the matching load id and shallow-merging `patch`,
     - returns `commit()` (invalidates queries) and `rollback()` (restores snapshot + shows the standard network-error toast).
   - Standard network-error message constant: `'Network error. Please try again when you have a better signal.'`

2. **`src/components/driver/ActiveLoadCard.tsx`**
   - Use `useOptimisticLoadStatus`.
   - In `handleProgressStatus` (non-intercept branch): call `applyOptimistic(load.id, { status: nextStatus })`, close/notify immediately, then `await supabase.update`; on error → `rollback()`; on success → quiet `commit()` and remove the existing redundant success toast (status change is now visible without it) or downgrade to a short confirmation.
   - Remove `isUpdating` button spinner (the load already advances visually); keep the button disabled only for the brief window between click and optimistic apply. Simplest: drop `isUpdating` entirely for this path.

3. **`src/components/driver/StartingOdometerDialog.tsx`**
   - Inject optimistic helper. On submit (online path):
     - Run `applyOptimistic(loadId, { status: nextStatus, start_miles: startMiles })`.
     - Immediately close dialog + `onComplete()`.
     - Await Supabase update in background; on error `rollback()` (which fires the friendly toast); on success `commit()` + concise success toast.

4. **`src/components/driver/EndingOdometerDialog.tsx`**
   - Same pattern with patch `{ status: nextStatus, end_miles, actual_miles? }`.

5. **`src/components/driver/ProofOfDeliveryDialog.tsx`**
   - Apply optimistic patch `{ status: 'delivered', end_miles, actual_miles? }` right before kicking off the signature upload + document inserts + status update.
   - On any thrown error in the try block → `rollback()` (friendly network toast) and keep dialog open with the form data preserved so the driver can retry. On success → `commit()`.
   - The existing toasts stay, but failure toast is replaced with the standardized network-error copy.

## UX details
- Single source of friendly copy: `'Network error. Please try again when you have a better signal.'` exported from the hook and reused across all four call sites.
- No new dependencies. Pure React Query cache surgery.
- Offline branch (`!isOnline`) untouched — it already enqueues and toasts.
- Optimistic updates only happen online; offline already feels instant via the queue.

## Out of scope
- No DB schema changes.
- No global mutation refactor (we're not introducing `useMutation` wrappers — keeping current `async` handlers, just adding cache patching around them).
- Status change for `delivered` via POD: signature/upload work still awaits the network; only the status badge on the dashboard updates optimistically.
