

## Plan: Configure BCO Toolkit Product Tour

### Overview
Replace the existing executive dashboard tour with a new 4-step BCO onboarding tour for the executive dashboard. Add `data-tour` attributes to the targeted elements and a `data-tour` attribute to the feedback widget button.

### Changes

**`src/lib/tour-steps.ts`** — Replace `executiveTour` with a new `bcoTour`:
- Step 1: Target `[data-tour="revenue-kpi"]` (the KPI cards section) — "Your Command Center" text
- Step 2: Target `[data-tour="nav-fleet-loads"]` — "Manage Your Freight" text  
- Step 3: Target `[data-tour="nav-finance"]` — "Automated Accounting" text
- Step 4: Target `[data-tour="beta-feedback"]` — "Shape the Platform" text
- Update tour ID to `bco_toolkit_v1`

**`src/components/layout/AppSidebar.tsx`** — Add `data-tour` attributes to the Fleet Loads and Finance nav items by passing them through the rendering logic (e.g., adding an optional `tourId` field to the nav item type and rendering it as `data-tour` on the `SidebarMenuItem`).

**`src/components/shared/BetaFeedbackWidget.tsx`** — Add `data-tour="beta-feedback"` to the floating action button.

**`src/pages/ExecutiveDashboard.tsx`** — Wrap the Health Score + KPI Cards row (line ~715) with `data-tour="revenue-kpi"` if not already present (it is — the existing `revenue-kpi` selector targets `RevenueKPICards` which is already inside this grid).

### Files
| File | Action |
|------|--------|
| `src/lib/tour-steps.ts` | Modify — new BCO tour steps |
| `src/components/layout/AppSidebar.tsx` | Modify — add `data-tour` to 2 nav items |
| `src/components/shared/BetaFeedbackWidget.tsx` | Modify — add `data-tour` to FAB |
| `src/pages/ExecutiveDashboard.tsx` | Verify/add `data-tour` wrapper on KPI section |

