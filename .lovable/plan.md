

## Fix Text Clipping and Overlap Across All Metric/KPI Cards

### Problem
Throughout the app, metric cards display an icon (like a dollar sign) with a value below or beside it. In constrained containers (especially responsive grids), the large bold text values overflow, clip, or overlap with labels. This affects readability on all screen sizes.

### Root Cause
- Large font sizes (`text-2xl`, `text-xl`) in fixed-width grid cells without overflow protection
- No `truncate`, `min-w-0`, or `overflow-hidden` on text containers
- Some grid layouts use too many columns for the available space

### Files to Fix

| File | Issue |
|------|-------|
| `src/pages/LoadOptimizer.tsx` | `MetricTile` — icon + value stacked in `text-center` with no overflow handling; `BreakdownRow` labels can be long |
| `src/components/executive/RevenueKPICards.tsx` | 5-col grid with `text-2xl` values that clip on medium screens |
| `src/components/executive/OperationalMetrics.tsx` | `MetricRow` value can overlap label on narrow widths |
| `src/components/finance/PLSummaryTab.tsx` | `grid-cols-3` boxes with `text-2xl` values; revenue flow boxes clip on small screens |
| `src/components/finance/InvoicingTab.tsx` | Long currency values in `text-2xl` beside icons |
| `src/components/maintenance/MaintenanceKPICards.tsx` | `text-2xl` values without truncation |
| `src/components/crm/CRMSummaryCards.tsx` | 6-col grid with icon+text cards, clipping on mid-range screens |
| `src/components/executive/CompanyHealthScore.tsx` | Metric breakdown grid on small screens |
| `src/pages/DriverPerformance.tsx` | KPI cards with `text-2xl` values |
| `src/components/driver/DriverPayWidget.tsx` | `text-3xl` earnings value can clip |
| `src/components/performance/PerformanceCharts.tsx` | Chart axis labels |

### Fix Strategy (Consistent Pattern)

1. **Add `min-w-0` to flex/grid children** — prevents flex items from refusing to shrink below content width
2. **Add `truncate` to value elements** — clips with ellipsis instead of overflowing
3. **Reduce font sizes on small screens** — use responsive classes like `text-lg sm:text-2xl`
4. **Add `overflow-hidden` to card containers** where needed
5. **Make grids responsive** — e.g., change `grid-cols-3` to `grid-cols-1 sm:grid-cols-3` where not already done
6. **Ensure proper `gap` and `flex-shrink-0`** on icons so they don't compress

### Example Fix (MetricTile in LoadOptimizer)
```tsx
// Before
<p className="text-xl font-bold ...">{value}</p>

// After  
<p className="text-lg sm:text-xl font-bold truncate ...">{value}</p>
```

### Example Fix (RevenueKPICards)
```tsx
// Before
<div className="text-2xl font-bold mb-1">{displayValue}</div>

// After
<div className="text-xl sm:text-2xl font-bold mb-1 truncate">{displayValue}</div>
```

### Scope
All ~11 files listed above, applying the same consistent pattern to every metric/value display element.

