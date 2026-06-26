## Realtime sync: admin settlement delete → driver view

### Findings
- Admin "delete settlement" lives in `DriverSettlementsTab.tsx` (`deleteSettlement` mutation), not `SettlementDetailSheet.tsx`. The Sheet only deletes individual line items. I'll harden both, and explicitly note in the diff comment that the parent tab owns settlement deletion.
- DB FK `driver_settlement_items.settlement_id → driver_settlements.id` is already `ON DELETE CASCADE`, so deleting a settlement row already purges its items at the DB level. No migration needed for cascade.
- Driver query in `MyPaystubsDialog.tsx` is `status in ('approved','paid')`, so reverting a settlement to `draft` should also remove it from the driver list — but only on refetch. Today there is no realtime listener or focus refetch, so a deleted/un-approved settlement stays visible (and clickable) on the driver side until the dialog is reopened.

### Changes

**1. Enable Realtime on settlement tables** — migration:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_settlements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_settlement_items;
```
(Wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` so the migration is idempotent.)

**2. Driver realtime hook** — new `src/hooks/useDriverSettlementsRealtime.ts`:
- `useEffect` subscribes to `postgres_changes` on `public.driver_settlements` filtered `driver_id=eq.<driverId>` and listens for `*` events.
- On any payload: `queryClient.invalidateQueries({ queryKey: ['my-paystubs', driverId] })` and `['paystub-items']` and `['driver-weekly-loads', driverId]`.
- Cleanup with `supabase.removeChannel(channel)`. Guard: skip if `!driverId`.

**3. `MyPaystubsDialog.tsx`**:
- Call `useDriverSettlementsRealtime(driverId)` when `open`.
- Add `refetchOnWindowFocus: true` to the `my-paystubs` query as a safety net.
- After realtime invalidation, if the currently-`selectedId` no longer exists in the refetched list (deleted or reverted to draft), auto-close the detail view: `useEffect(() => { if (selectedId && !paystubs.some(p => p.id === selectedId)) setSelectedId(null); }, [paystubs, selectedId])`. This prevents the user from staying on an obsolete detail screen.

**4. `DriverPayWidget.tsx`**:
- Same realtime hook so the "My Settlements" button badge/count stays fresh; invalidates `driver-weekly-loads` too.

**5. Admin delete handler hardening** (`DriverSettlementsTab.tsx` `deleteSettlement`):
- Keep DB cascade as the primary purge mechanism (already in place).
- Belt-and-suspenders: before deleting the settlement, explicitly `supabase.from('driver_settlement_items').delete().eq('settlement_id', id)` so older databases without the FK cascade still purge children. Ignore "no rows" errors.
- On success, invalidate `['driver_settlements']`, `['driver_settlement_items']`, and `['driver_settlement', id]` to clear any admin-side detail caches.
- Add a brief comment that driver-side cache is purged via Realtime publication on `driver_settlements`.

### Out of scope
- No changes to settlement generation, PDF, or pay math.
- No new RLS — existing driver SELECT policy already constrains which rows the driver receives over Realtime.

### Verification
- `tsgo` typecheck.
- Playwright: open driver `/driver-view/...`, open "My Settlements" list. In a second psql session, `DELETE FROM driver_settlements WHERE id = '<one shown>'`. Confirm the row disappears from the list within ~1s with no reload, and that if it was open in detail view it auto-returns to the list.
- Repeat with `UPDATE driver_settlements SET status='draft' WHERE id=...` → row should also disappear (filtered by `status in ('approved','paid')`).
