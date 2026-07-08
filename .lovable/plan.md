# CRM Lane-Match Revenue Hub

Turn the CRM broker/agent view into a Landstar-style Lane Match hub by pulling completed-load history from `fleet_loads` and joining it to `crm_contacts.agent_code`.

## Scope note (data model)

`fleet_loads.agency_code` is the Landstar 3-letter code (BRK, SJE, BML…). Aggregations join `crm_contacts.agent_code` → `fleet_loads.agency_code`. Brokers whose `agent_code` holds an MC number won't match — they'll show zero volume, which is correct (MC numbers aren't tracked on loads today). Only contacts with a real agency code contribute to the leaderboard and lane list.

"Completed" = `fleet_loads.status IN ('delivered', 'invoiced', 'paid')`. Revenue metric = `COALESCE(net_revenue, gross_revenue, rate, 0)` summed per agency code, labeled "Adjusted Gross Revenue".

## 1. `src/hooks/useCRMData.ts` — new aggregation hooks

Add three hooks, all scoped by org via existing RLS:

- **`useAgentVolumeStats()`** → `Record<agencyCode, { loadCount: number; adjustedGrossRevenue: number; recentLoadCount60d: number; topLane: string | null }>`
  - Single query: `fleet_loads.select('agency_code, net_revenue, gross_revenue, rate, origin, destination, delivery_date, status').in('status', [...])`. Aggregate client-side (fleet already caps at reasonable volumes for one org; if >5k rows we chunk).
  - `recentLoadCount60d` = count where `delivery_date >= now - 60d`.
  - `topLane` = most-frequent `origin → destination` string.
  - 5-min `staleTime`.

- **`useAgentLanes(agencyCode: string | null)`** → `Array<{ origin: string; destination: string; count: number; lastDeliveredAt: string | null; totalRevenue: number }>`
  - Query completed `fleet_loads` filtered by `agency_code`. Group in JS, sort by `count desc`, cap at 25.

- **`useAgentRecentVolume(agencyCode)`** → `{ recentLoadCount60d, priorityDispatch: boolean }` (derived from the first hook, exposed as a selector helper for `ContactDetailSheet`).

Priority Dispatch rule: `recentLoadCount60d > 5`.

## 2. `src/components/crm/BrokerDatabase.tsx` — leaderboard

- Consume `useAgentVolumeStats()` and merge stats onto each broker by `agent_code`.
- Two summary cards replace the "With MC#" and "Avg Days to Pay" tiles at the top (keep those below in a secondary row if space allows):
  - Total Loads Moved (sum across all listed brokers with an agency code)
  - Total Adjusted Gross Revenue
- Add three new columns to the `DataTable`:
  - `Loads` (numeric, sortable)
  - `Adj. Gross Revenue` (currency, sortable)
  - `Priority` — shows a "Priority Dispatch" badge when `recentLoadCount60d > 5`
- Default sort: `adjustedGrossRevenue desc`, tiebreak `loadCount desc`. Rows with no matching agency code sort to the bottom. Existing search unchanged.

## 3. `src/components/crm/ContactDetailSheet.tsx` — Priority Dispatch panel + Lanes tab

- **Priority Dispatch panel**: when the contact has an `agent_code` and `recentLoadCount60d > 5`, render a callout at the very top of the scroll area (above the existing type-aware section) with:
  - Priority Dispatch badge
  - Large tel: link (phone) with call icon
  - Primary Lane Specialty = `topLane` from the stats hook
  - Recent volume: "X loads in last 60 days"
- **New "Lanes" tab** (only when `supportsTabs` and `contact.agent_code`):
  - Insert a fourth tab between "Load History" and "Revenue": `Lanes`.
  - Renders a scannable list from `useAgentLanes(contact.agent_code)`:
    - `Origin → Destination` in bold, `Count: N loads` right-aligned, small `Last: <date>` and `Revenue: $X` below.
  - Empty state: "No completed loads recorded for agency code {code} yet."

## Verification

- Open the CRM, confirm brokers sort by Adjusted Gross Revenue and Loads columns show real values for agents whose `agent_code` matches historical `fleet_loads.agency_code`.
- Open an agent's detail sheet: Priority Dispatch banner appears only when 60-day count > 5; Lanes tab lists top origin→destination pairs with counts.
- Brokers/agents without a matching agency code render blank stats gracefully (no NaN, no errors).

## Out of scope

- No new database tables or views. All aggregation is client-side against `fleet_loads` via existing RLS.
- No changes to how `agent_code` is captured on the broker form (MC numbers remain user-editable).
