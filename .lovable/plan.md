

## Beta Launch Feature Epic: Smart Trip, Predictive Maintenance, Load Vetting, and SaaS QoL

This epic covers four major features to prepare FleetFlow for closed beta. Each is broken into discrete implementation steps.

---

### 1. Polyline-Based Fuel & Routing Intelligence ("Smart Trip")

**Current State:** The edge function uses multi-segment straight-line corridors (origin -> waypoints -> destination) to filter fuel stops. The frontend already fetches OSRM route polylines but only sends waypoint coordinates to the backend.

**Changes:**

**Frontend (`TripFuelPlanner.tsx`):**
- Send the full OSRM route polyline coordinates to the edge function alongside the existing waypoints
- Add a "Projected Fuel Savings" summary card comparing cheapest route stop vs national average, showing total savings for the trip

**Backend (`landstar-fuel-stops/index.ts`):**
- Accept an optional `route_polyline` field (array of `[lat, lng]` tuples)
- When present, replace the multi-segment corridor filter with polyline-based filtering: for each fuel stop, compute the minimum distance to any segment of the decoded polyline (sampling every ~20 points for performance)
- Keep the existing multi-segment fallback when no polyline is provided
- Add a `projected_savings` field to the response comparing the cheapest in-corridor stop against the EIA state average

**Frontend (`FuelPlannerMap.tsx`):**
- Add a subtle corridor visualization (semi-transparent buffer along the route polyline) to show the search area
- Differentiate "Recommended" (cheapest LCAPP within 25mi) stops with a star marker icon

| File | Change |
|------|--------|
| `src/components/driver/TripFuelPlanner.tsx` | Send `route_polyline` in edge function request body; add Projected Savings card |
| `supabase/functions/landstar-fuel-stops/index.ts` | Accept `route_polyline`, implement polyline-segment distance filter, return `projected_savings` |
| `src/components/driver/fuel-planner/FuelPlannerMap.tsx` | Add corridor buffer visualization, recommended stop marker |

---

### 2. Dynamic, Multi-Model Predictive Maintenance

**Current State:** `usePMHealthCalculations.ts` uses hardcoded thresholds (1000 mi, 14 days). Manufacturer profiles already exist in the `manufacturer_pm_profiles` table with per-make service intervals. The `PreventiveMaintenanceTab` reads from these dynamically.

**Changes:**

**New config (`src/lib/truck-maintenance-profiles.ts`):**
- Create a `TRUCK_MAINTENANCE_PROFILES` dictionary keyed by `make` and optionally `model`
- Define baseline lifespans for critical wear parts beyond the PM schedule: brakes (300k mi), DPF (250k mi), turbo (400k mi), clutch (350k mi), alternator (200k mi)
- Each entry includes `make`, `model` (or "all"), `part_name`, `lifespan_miles`, and `warning_threshold_pct` (default 20%)

**Health calculations (`usePMHealthCalculations.ts`):**
- Import the profiles dictionary
- Add wear-part health calculation based on truck mileage since purchase (`current_odometer - purchase_mileage`) divided by part lifespan
- Expose per-part health percentages in the return value

**PM Tab (`PreventiveMaintenanceTab.tsx`):**
- Add an "Urgent Action Required" banner at the top when any truck has a part below 20% health
- The banner lists affected trucks and parts with links to the truck history drawer

**Truck History Drawer (`TruckHistoryDrawer.tsx`):**
- Add a "Component Health" section showing color-coded degradation bars for each wear part based on the truck's make/model profile
- Green (>50%), Amber (20-50%), Red (<20%)

| File | Change |
|------|--------|
| `src/lib/truck-maintenance-profiles.ts` | New file: `TRUCK_MAINTENANCE_PROFILES` dictionary |
| `src/components/maintenance/usePMHealthCalculations.ts` | Add wear-part health from profiles, expose per-part health |
| `src/components/maintenance/PreventiveMaintenanceTab.tsx` | Add "Urgent Action Required" banner |
| `src/components/maintenance/TruckHistoryDrawer.tsx` | Add Component Health degradation bars section |

---

### 3. Load Vetting & Broker CRM Workflow

**Current State:** `ActiveLoadsBoard.tsx` shows active loads with basic status badges. CRM has activity logging and contact revenue stats. There is no trust scoring or load flagging.

**Changes:**

**New hook (`src/hooks/useAgentTrustScore.ts`):**
- Query `crm_activities` for a given broker/agent contact, counting negative flags (bait & switch, load gone) vs total interactions
- Return a trust level: "trusted" (green), "neutral" (gray), "risky" (red) based on ratio
- Cache results per contact

**ActiveLoadsBoard (`ActiveLoadsBoard.tsx`):**
- Redesign as "Load Vetting Board" with enhanced load cards
- Add "Agent Trust Score" badge using the broker's CRM history (green/gray/red shield icon)
- Add "Suspicious Load" flag for loads missing `booked_miles` or with RPM (rate/miles) below $1.50 or above $5.00
- Add click handler to open the "Rapid Call Workflow" modal

**New component (`src/components/dispatcher/RapidCallModal.tsx`):**
- Modal with load details at top
- Quick-action buttons: "Log Voicemail", "Load Gone", "Flag Bait & Switch"
- Each action creates a CRM activity on the associated broker/agent contact
- "Flag Bait & Switch" also updates the contact's tags array to include "bait_switch"
- Shows the contact's recent activity timeline inline

| File | Change |
|------|--------|
| `src/hooks/useAgentTrustScore.ts` | New: compute trust score from CRM activity history |
| `src/components/dispatcher/ActiveLoadsBoard.tsx` | Redesign as Load Vetting Board with trust badges, suspicious flags, modal trigger |
| `src/components/dispatcher/RapidCallModal.tsx` | New: quick-log modal with CRM sync |

---

### 4. SaaS QoL: Multi-Tenant Context & Profitability Views

**Current State:** The app has org-level subscription tiers and multi-tenant isolation. No CPM-based profitability is shown. No workspace switcher exists.

**Changes:**

**New hook (`src/hooks/useOperationalCPM.ts`):**
- Query `company_settings` for an `operational_cpm` setting (cost-per-mile)
- Default to $1.75/mi if not configured
- Provide a `calculateTrueProfit(grossRevenue, miles)` helper

**Executive Dashboard updates (`src/components/executive/RevenueKPICards.tsx`):**
- Add a "True Profit Margin" KPI card that uses the org's CPM against total gross and total miles
- Show gross revenue, operational cost (CPM x miles), and true profit with percentage

**Sidebar workspace switcher (`AppSidebar.tsx`):**
- Add a subtle org name display with a dropdown placeholder below the banner logo
- Show current org name with a `ChevronsUpDown` icon
- On click, show a dropdown with the current org (active) and a disabled "Add Workspace" option with a "Coming Soon" badge
- Purely visual placeholder for multi-workspace support

| File | Change |
|------|--------|
| `src/hooks/useOperationalCPM.ts` | New: fetch CPM from company_settings, provide profit calculator |
| `src/components/executive/RevenueKPICards.tsx` | Add True Profit Margin KPI card |
| `src/components/layout/AppSidebar.tsx` | Add org name display with workspace switcher placeholder |

---

### Technical Details

**Edge function deployment:** The `landstar-fuel-stops` function will be redeployed after changes.

**No database migrations required:** All new data structures are client-side configuration dictionaries or leverage existing tables (`company_settings` for CPM, `crm_activities` for trust scores).

**Performance considerations:**
- Polyline filtering samples every ~20 points from the OSRM route to avoid O(n*m) blowup with large polylines
- Trust score queries are cached via React Query with a 5-minute stale time
- Wear-part health is computed in the existing `useMemo` block

**Files created (4 new):**
1. `src/lib/truck-maintenance-profiles.ts`
2. `src/hooks/useAgentTrustScore.ts`
3. `src/hooks/useOperationalCPM.ts`
4. `src/components/dispatcher/RapidCallModal.tsx`

**Files modified (8 existing):**
1. `src/components/driver/TripFuelPlanner.tsx`
2. `src/components/driver/fuel-planner/FuelPlannerMap.tsx`
3. `supabase/functions/landstar-fuel-stops/index.ts`
4. `src/components/maintenance/usePMHealthCalculations.ts`
5. `src/components/maintenance/PreventiveMaintenanceTab.tsx`
6. `src/components/maintenance/TruckHistoryDrawer.tsx`
7. `src/components/dispatcher/ActiveLoadsBoard.tsx`
8. `src/components/layout/AppSidebar.tsx`

