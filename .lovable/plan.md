

## Integrate Driver Performance Leaderboard into Dispatcher & Driver Dashboards

### New Component: `src/components/shared/DriverLeaderboard.tsx`

A standalone podium-style leaderboard component that:
- Fetches active drivers and their delivered `fleet_loads` for the current month
- Ranks by **Total Miles** and **Total Revenue** (two mini-leaderboards side by side)
- Displays top 3 with gold/silver/bronze podium styling (colored circles with medal icons/numbers)
- Shows remaining drivers in a compact list below the podium
- Accepts a `readOnly?: boolean` prop (hides any action buttons for driver view)
- Self-contained data fetching via `useQuery` — no dependency on the existing `useDriverPerformanceData` hook (which is heavier than needed)

**Data query logic:**
```sql
-- Fetch active drivers
SELECT id, first_name, last_name FROM drivers_public_view WHERE status = 'active'

-- Fetch delivered loads for current month
SELECT driver_id, actual_miles, net_revenue FROM fleet_loads
WHERE status = 'delivered'
  AND delivery_date >= startOfMonth
  AND delivery_date <= endOfMonth
```

Aggregate client-side per driver, sort by miles and revenue separately.

**Visual design:**
- Card with title "Driver Leaderboard — {Month Year}"
- Two columns (or tabs on mobile): "Miles Leader" and "Revenue Leader"
- Top 3 shown as podium cards with:
  - Rank 1: `bg-yellow-400/20 border-yellow-400` (gold)
  - Rank 2: `bg-gray-300/20 border-gray-300` (silver)
  - Rank 3: `bg-amber-600/20 border-amber-600` (bronze)
  - Trophy/Medal icon from lucide (`Trophy`, `Medal`, `Award`)
- Remaining drivers listed compactly with rank number

### Changes to `src/pages/DispatcherDashboard.tsx`
- Import and add `<DriverLeaderboard />` between the Fleet Timeline Scheduler and Active Loads Board sections (line ~193)

### Changes to `src/pages/DriverDashboard.tsx`
- Import and add `<DriverLeaderboard readOnly />` after the Monthly Bonus Widget (line ~214), before the Requests card

### Files
| File | Action |
|------|--------|
| `src/components/shared/DriverLeaderboard.tsx` | Create — new podium leaderboard component |
| `src/pages/DispatcherDashboard.tsx` | Edit — add leaderboard import + render |
| `src/pages/DriverDashboard.tsx` | Edit — add read-only leaderboard import + render |

