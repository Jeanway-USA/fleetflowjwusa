## Driver Dashboard — Intermediate Stops Timeline + Confirm Flow

### 1. Read structured stops on the driver's active load
- In `src/components/driver/ActiveLoadCard.tsx`, fetch `load_intermediate_stops` for the current `load_id` (ordered by `stop_number`) via TanStack Query. Drop the legacy `=== INTERMEDIATE STOPS ===` notes parser only as the source of truth for stops; keep the notes text rendering unchanged for backwards compatibility on loads that don't have structured rows yet.
- Cache key: `['load-intermediate-stops', loadId]`. Refetch on confirm-success.

### 2. New component: `IntermediateStopsTimeline.tsx`
Location: `src/components/driver/IntermediateStopsTimeline.tsx`.

Renders a vertical timeline:
```text
●──  Stop 1 · Pickup · ACME Warehouse — Dallas, TX
│    Completed 06/24 14:02 · HOS left: 6.5 hr
●──  Stop 2 · Drop · Cooler #4 — Houston, TX        [Confirm Stop Delivery]
○    Stop 3 · Pickup · ...                          (disabled — complete prior stop first)
```
- Status dot colors via design tokens (`bg-primary` completed, `bg-muted` pending).
- Shows `facility_name`, `location`, `scheduled_date`, plus `completed_at` + `remaining_hos` once completed.
- **Strict sequence**: only the first `status='pending'` row shows an enabled `Confirm Stop Delivery` button (`h-12`, full width on mobile). Later pending rows render a disabled button with tooltip "Complete previous stops first".
- Empty state: nothing rendered if there are no structured stops (notes block still shows).

### 3. New component: `ConfirmStopDialog.tsx`
Location: `src/components/driver/ConfirmStopDialog.tsx`. Modeled after `EndingOdometerDialog.tsx` for visual/UX consistency.

- Props: `stop`, `open`, `onOpenChange`, `onConfirmed`.
- Single required input: **Remaining Hours of Service (HOS)** — numeric, `0–11` valid range, `inputMode="decimal"`, same sanitizer as the end-of-load dialog.
- Confirm button disabled until valid; shows inline validation message.
- On submit:
  1. `UPDATE load_intermediate_stops SET status='completed', remaining_hos=<value>, completed_at=now() WHERE id=<stop.id>` via Supabase client (RLS already org-scoped).
  2. Optimistic UI: mark row completed in cache, then `queryClient.invalidateQueries(['load-intermediate-stops', loadId])`.
  3. Toast: `sonner` success "Stop confirmed". On error, rollback + error toast.
  4. Close dialog; focus returns to next pending stop's button.

### 4. Integration in `ActiveLoadCard.tsx`
- Mount `<IntermediateStopsTimeline loadId={load.id} driverId={driverId} />` directly above (or replacing, when structured data exists) the existing free-text intermediate stops block.
- No changes to the End-of-Load / odometer flow.

### 5. Out of scope
- No schema changes — `load_intermediate_stops` already has `status`, `remaining_hos`, `completed_at`.
- No edits to FleetLoads (dispatcher) side, rate-conf parser, or notes generation.
- No changes to existing HOS snapshot at end of load.

### Technical notes
- Cache invalidation only — no realtime subscription needed; the driver is the only actor on their own stops.
- All buttons `h-12` for touch (per mobile-ux memory).
- Date formatting uses `'YYYY-MM-DDT00:00:00'` parse pattern for `scheduled_date` (per date-handling memory).
- New files only under `src/components/driver/`. No DB migration, no edge function.

### Files
- **Create** `src/components/driver/IntermediateStopsTimeline.tsx`
- **Create** `src/components/driver/ConfirmStopDialog.tsx`
- **Edit** `src/components/driver/ActiveLoadCard.tsx` (mount timeline; leave notes parser intact)