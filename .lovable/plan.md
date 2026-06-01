## Add Product Tour CSS IDs to Driver Dashboard

### Goal
Add stable CSS `id` attributes to key Driver Dashboard UI sections so the Product Tour can reliably target them for clip-path bounding boxes.

### Changes

**File: `src/pages/DriverDashboard.tsx`**
- Wrap the `<ActiveLoadCard>` usage (inside its `ErrorBoundary`) with `<div id="tour-active-load">`
- Wrap the `<MonthlyBonusWidget>` usage with `<div id="tour-safety-bonus">`
- Wrap the `<DriverPayWidget>` usage (inside its grid cell and `ErrorBoundary`) with `<div id="tour-pay-widget">`
- Wrap the `<DriverNotifications>` usage (inside its header `ErrorBoundary`) with `<div id="tour-notifications">`
- Wrap the `<DocumentScanButton>` usage with `<div id="tour-document-scan">`
- Wrap the `<DriverRequestsCard>` and `<MaintenanceRequestCard>` usages together with `<div id="tour-driver-requests">`

All IDs are applied to plain `<div>` wrappers in the page file so the tour engine gets stable, dimensioned DOM targets. No component internals are changed.

### Verification
- Confirm all six IDs appear exactly once in `DriverDashboard.tsx`
- Ensure no visual/layout regressions (wrappers are unstyled `div`s)