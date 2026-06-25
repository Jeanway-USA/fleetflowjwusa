# Fix: Company/Local time toggle has no effect

## Root cause

`TimeDisplayProvider` is mounted in `App.tsx` and the toggle in `DashboardLayout` writes the preference correctly. But only **one** component in the app actually reads it: `src/components/loads/IndependentLoadBuilder.tsx` via `<StopTime>`.

Every other surface that shows pickup/delivery times still reads the legacy `pickup_time` / `delivery_time` strings directly and formats them with `format()` or raw concatenation. Those renderers ignore `useTimeDisplay()`, so flipping the toggle changes nothing on screen.

Surfaces still on legacy strings (confirmed via grep on `pickup_time` / `delivery_time` / `pickup_date` / `delivery_date`):

- `src/pages/FleetLoads.tsx`
- `src/pages/DispatcherDashboard.tsx` (+ `UpcomingPickups`, `ActiveLoadsBoard`, `FleetTimelineScheduler`, `RapidCallModal`, `DriverAssignmentPanel`)
- `src/pages/DriverDashboard.tsx` + `src/components/driver/ActiveLoadCard.tsx` and `IntermediateStopsTimeline.tsx`
- `src/pages/DriverSpectatorView.tsx`, `DriverStats.tsx`
- `src/pages/ExecutiveDashboard.tsx` + `MorningBriefingWidget`
- `src/pages/PublicLoadTracker.tsx`
- `src/pages/CompanyInsights.tsx`, `IFTA.tsx`, `Finance.tsx`
- `src/components/crm/ContactLoadHistory.tsx`
- `src/components/finance/*` (InvoicePreviewDialog, LoadProfitabilityTab, RevenueTab, SettlementsTab, AuditReconciliation, InvoicingTab, DriverSettlementsTab)
- `src/components/loads/IntermediateStopsView.tsx`

## Plan

1. **Replace pickup/delivery time rendering** in user-facing load views with `<StopTime utcIso={load.pickup_at} tz={load.pickup_tz} withDate />` (and the delivery equivalent). The component already subscribes to `useTimeDisplay`, so the toggle will start working everywhere it's used.

2. **Fallback for old rows** that have `pickup_date`/`pickup_time` but null `pickup_at`/`pickup_tz`: inside `StopTime` (or a small wrapper), when `utcIso` is null, derive an instant from the legacy fields using `combineToUtc(date, time, tz ?? companyTz)` so historical loads still display and still respond to the toggle.

3. **Scope of this pass** — visible appointment timestamps only. Limit edits to:
   - Driver-facing: `ActiveLoadCard`, `IntermediateStopsTimeline`, `DriverDashboard`, `DriverLoads`, `DriverSpectatorView`.
   - Dispatcher: `DispatcherDashboard`, `ActiveLoadsBoard`, `UpcomingPickups`, `FleetTimelineScheduler`, `RapidCallModal`, `DriverAssignmentPanel`.
   - Loads: `FleetLoads`, `AgencyLoads`, `IntermediateStopsView`, `PublicLoadTracker`.
   - Executive: `MorningBriefingWidget`, `ExecutiveDashboard` load lists.

4. **Out of scope** (keep on raw dates — these are accounting/report contexts where timezone display isn't the user concern, and changing them risks breaking IFTA/settlement math):
   - `src/components/finance/*`, `src/pages/Finance.tsx`, `IFTA.tsx`, `CompanyInsights.tsx`, `ContactLoadHistory.tsx`, `DriverStats.tsx`.
   These will continue to use `formatDate(pickup_date)` for date-only display.

5. **Verify** by loading `/fleet-loads`, `/dispatcher`, `/dashboard` (driver), toggling Company↔Local in the header, and confirming stop times re-render (secondary `(HH:mm TZ) your time` line appears when zones differ).

## Technical notes

- No schema or business-logic changes. Pure presentation swap from legacy string formatting to `<StopTime>`.
- One small enhancement to `StopTime` (or a new `LegacyStopTime` wrapper) for the legacy-row fallback so the toggle works on old data too.
- No changes to `combineToUtc` payloads on writes — that contract already works in form code.
