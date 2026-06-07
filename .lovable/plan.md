# Bundle-Size Optimization — Lazy-load Heavy Components

## What's heavy

Confirmed via dependency audit + import scan:

| Library | Approx weight | Used by |
|---|---|---|
| `recharts` | ~95 KB gz | RevenueTrendsChart, CostBreakdownChart, PerformanceCharts, RevenueTab, LoadProfitabilityTab, ContactRevenueStats, MaintenanceKPICards, TruckHistoryDrawer, EngagementTab |
| `leaflet` + `react-leaflet` | ~45 KB gz + CSS | FleetMapView, JurisdictionMap, LoadRouteMap |
| `xlsx` | ~140 KB gz | parse-landstar-xlsx → StatementUpload |
| `jspdf` | ~85 KB gz | MyPaystubsDialog, generateSignedPdf |
| `html2canvas` | ~45 KB gz | BetaFeedbackWidget ✅ already dynamic-imported |
| `canvas-confetti` | ~7 KB gz | MonthlyBonusWidget (small — skip) |

Pages are already route-lazy in `App.tsx`, but these heavy components still live inside those route chunks. Splitting them yields:
- Faster TTI on Dispatcher / Driver / Executive dashboards
- Finance tabs only pay for `recharts`/`xlsx` when their tab is opened
- CRM contact sheet only pays for `recharts` when opened

## Changes

Lightweight `<ChartSkeleton />` and `<MapSkeleton />` will be added to `src/components/shared/` (just a `Skeleton` block with the right aspect ratio) and reused by all wrappers.

**Lazy + Suspense at import sites** — replace static imports with `lazy(() => import(...))` and wrap render in `<Suspense fallback={<Skeleton …/>}>`:

Maps (Leaflet):
- `src/pages/DispatcherDashboard.tsx` → `FleetMapView`
- `src/pages/IFTA.tsx` → `JurisdictionMap`
- `src/components/driver/ActiveLoadCard.tsx` → `LoadRouteMap`
- `src/components/dispatcher/ActiveLoadsBoard.tsx` → `LoadRouteMap`
- `src/pages/PublicLoadTracker.tsx` → `LoadRouteMap`

Charts (Recharts):
- `src/pages/ExecutiveDashboard.tsx` → `RevenueTrendsChart`, `CostBreakdownChart`
- `src/pages/DriverPerformance.tsx` → `PerformanceCharts`
- `src/pages/Finance.tsx` → `RevenueTab`, `LoadProfitabilityTab` (only the active tab loads — biggest win)
- `src/pages/MaintenanceManagement.tsx` → `MaintenanceKPICards`, `TruckHistoryDrawer`
- `src/components/crm/ContactDetailSheet.tsx` → `ContactRevenueStats`
- `src/pages/SuperAdminDashboard.tsx` → `EngagementTab`

Heavy dialogs (jspdf):
- `src/components/driver/DriverPayWidget.tsx` → `MyPaystubsDialog`
- `src/components/driver/WeeklyPerformanceWidget.tsx` → `MyPaystubsDialog`

Heavy uploaders (xlsx):
- `src/pages/Finance.tsx` → `StatementUpload`
- Inside `src/lib/parse-landstar-xlsx.ts`: convert `import * as XLSX from 'xlsx'` to a dynamic `await import('xlsx')` inside `parseLandstarXlsx()` so the 140 KB library is only fetched at the moment a user actually parses a statement (this is the single biggest win and doesn't require touching component trees).

## Out of scope

- No changes to `App.tsx` route-level lazy loading (already correct).
- No changes to `BetaFeedbackWidget` (`html2canvas` is already dynamic).
- No changes to `MonthlyBonusWidget` (`canvas-confetti` is <10 KB).
- No bundler config changes (manual chunking, `optimizeDeps`).
- No prefetch hints — keep it simple; route nav already triggers the prefetch.

## Verification

- Typecheck (harness runs automatically)
- Spot-check preview: dashboards still render, dialogs still open, skeletons appear briefly on first open
