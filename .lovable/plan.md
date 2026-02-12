

# QoL Improvements and Bug Fixes

## Issues Found

### 1. CRITICAL: Double Dashboard Layout (affects ALL pages)
Every page component (21 files) wraps its content in `<DashboardLayout>`, but `ProtectedRoute` already wraps children in `<DashboardLayout>`. This results in a double sidebar + double header on every protected page. The fix is to remove the `<DashboardLayout>` wrapper from all 21 page components, since `ProtectedRoute` handles it.

**Affected files (21 total):**
- FleetLoads, Trucks, Trailers, Drivers, AgencyLoads
- Settings, DriverSettings, DriverStats
- Finance, CompanyInsights, IFTA
- ExecutiveDashboard, DispatcherDashboard, DriverDashboard
- Documents, Safety, Incidents
- DriverPerformance, DriverSpectatorView
- MaintenanceManagement, CRM

### 2. Accessibility Warnings: Missing DialogTitle / DialogDescription
Console shows repeated errors about `DialogContent` missing a `DialogTitle` or `Description`. Some dialogs in the codebase use `DialogContent` without the required accessibility elements. Each dialog needs either a visible title/description or the Radix `VisuallyHidden` wrapper for screen readers. The most likely offenders are viewer/detail dialogs that use custom headers.

### 3. 406 Errors on Driver Dashboard for Non-Driver Users
The demo user (owner role) navigating to Driver Dashboard triggers a `.single()` query on the `drivers` table filtered by `user_id`. Since the demo owner has no driver record, PostgREST returns a 406 "cannot coerce to single object" error repeatedly. The fix is to use `.maybeSingle()` instead so it gracefully returns `null`.

---

## Technical Changes

### Step 1: Remove DashboardLayout from all 21 page files

For each page, remove the `<DashboardLayout>` wrapper and its import. The page should return its content directly (the `PageHeader`, cards, dialogs, etc.) since `ProtectedRoute` already provides the layout.

Example transformation for `FleetLoads.tsx`:

Before:
```tsx
import { DashboardLayout } from '@/components/layout/DashboardLayout';
// ...
return (
  <DashboardLayout>
    <PageHeader ... />
    {/* page content */}
  </DashboardLayout>
);
```

After:
```tsx
// remove DashboardLayout import
// ...
return (
  <>
    <PageHeader ... />
    {/* page content */}
  </>
);
```

Note: Some pages have multiple return paths (e.g., `DriverDashboard` has loading, no-driver, and normal states -- all three wrapped in `DashboardLayout`). Each return path needs unwrapping.

### Step 2: Fix `.single()` to `.maybeSingle()` on driver queries

In `DriverDashboard.tsx` (and any other file using `.single()` for driver-by-user lookup), change to `.maybeSingle()` to avoid the 406 error when no row exists.

### Step 3: Add missing DialogDescription to dialogs

For dialogs that are missing the `DialogDescription` element, add a `DialogDescription` (or use Radix `VisuallyHidden` with a description) to suppress the accessibility warning. This applies to dialogs across pages like Trucks, Trailers, FleetLoads, etc.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/FleetLoads.tsx` | Remove DashboardLayout wrapper (3 return paths) |
| `src/pages/Trucks.tsx` | Remove DashboardLayout wrapper |
| `src/pages/Trailers.tsx` | Remove DashboardLayout wrapper |
| `src/pages/Drivers.tsx` | Remove DashboardLayout wrapper |
| `src/pages/AgencyLoads.tsx` | Remove DashboardLayout wrapper |
| `src/pages/Settings.tsx` | Remove DashboardLayout wrapper (2 return paths) |
| `src/pages/DriverSettings.tsx` | Remove DashboardLayout wrapper (3 return paths) |
| `src/pages/DriverStats.tsx` | Remove DashboardLayout wrapper |
| `src/pages/Finance.tsx` | Remove DashboardLayout wrapper |
| `src/pages/CompanyInsights.tsx` | Remove DashboardLayout wrapper |
| `src/pages/IFTA.tsx` | Remove DashboardLayout wrapper |
| `src/pages/ExecutiveDashboard.tsx` | Remove DashboardLayout wrapper |
| `src/pages/DispatcherDashboard.tsx` | Remove DashboardLayout wrapper |
| `src/pages/DriverDashboard.tsx` | Remove DashboardLayout wrapper (3 return paths), fix `.single()` to `.maybeSingle()` |
| `src/pages/Documents.tsx` | Remove DashboardLayout wrapper |
| `src/pages/Safety.tsx` | Remove DashboardLayout wrapper |
| `src/pages/Incidents.tsx` | Remove DashboardLayout wrapper |
| `src/pages/DriverPerformance.tsx` | Remove DashboardLayout wrapper |
| `src/pages/DriverSpectatorView.tsx` | Remove DashboardLayout wrapper |
| `src/pages/MaintenanceManagement.tsx` | Remove DashboardLayout wrapper |
| `src/pages/CRM.tsx` | Remove DashboardLayout wrapper |

No database changes required.

