

## Plan: Error Boundaries Across Layouts and Dashboards

### Changes

**1. `src/components/shared/ErrorBoundary.tsx`** — Upgrade with Try Again + compact widget mode

- Add a `resetErrorBoundary` method that sets `hasError: false`
- Add a "Try Again" button that calls it
- Add an `AlertCircle` icon to the fallback
- Accept an optional `fallbackClassName` prop so widget-level boundaries render compact (no `min-h-[60vh]`)
- The compact variant shows a small inline card instead of a centered page-level crash screen

**2. `src/components/layout/DashboardLayout.tsx`** — Wrap `{children}` (line 198-199)

- Import `ErrorBoundary` and wrap the `{children}` slot so page-level crashes preserve the sidebar/header shell

**3. `src/pages/DispatcherDashboard.tsx`** — Wrap heavy widgets

Wrap these in individual `<ErrorBoundary>` instances:
- `<FleetMapView />` (line 178)
- `<DriverAssignmentPanel />` (line 183)
- `<FleetTimelineScheduler />` (line 193)
- `<ActiveLoadsBoard />` (line 199)
- `<DriverLeaderboard />` (line 196)

**4. `src/pages/DriverDashboard.tsx`** — Wrap heavy widgets

- `<ActiveLoadCard />` (line 175)
- `<TripFuelPlanner />` (line 185)
- `<LocationSharing />` + `<DriverPayWidget />` grid (lines 201-212)
- `<DriverRequestsCard />` (line 221)

**5. `src/pages/ExecutiveDashboard.tsx`** — Wrap heavy widgets

- `<MorningBriefingWidget />` (line 704)
- `<CriticalAlertsBar />` (line 707)
- `<RevenueTrendsChart />` (line 726)
- `<OperationalMetrics />` + `<CostBreakdownChart />` grid contents (lines 730-731)
- `<FleetStatusCard />` + `<DriverAvailabilityCard />` grid contents (lines 721-722)

### Implementation Details

The updated `ErrorBoundary` will accept an optional `compact` prop. When true, it renders a small inline alert card instead of a full-page crash screen — appropriate for individual widgets. The "Try Again" button resets internal state, causing React to re-mount the child tree.

```typescript
// Usage in dashboard pages:
<ErrorBoundary compact>
  <FleetMapView />
</ErrorBoundary>
```

### Files Modified
| File | Change |
|------|--------|
| `ErrorBoundary.tsx` | Add Try Again button, AlertCircle icon, compact mode |
| `DashboardLayout.tsx` | Wrap children in ErrorBoundary |
| `DispatcherDashboard.tsx` | Wrap 5 heavy widgets |
| `DriverDashboard.tsx` | Wrap 4 heavy widgets |
| `ExecutiveDashboard.tsx` | Wrap 6 heavy widgets |

