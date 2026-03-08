

## Redesign: Collapsible Sidebar Navigation Groups

### Current State
The sidebar has 5 flat groups (Dashboards, Fleet, Loads, Finance, Operations) separated by dividers. No collapse/expand behavior. Active route uses a subtle `bg-primary/10` highlight.

### Plan

**File: `src/components/layout/AppSidebar.tsx`** -- Major restructure

**1. Regroup nav items into 3 collapsible sections:**

| Group | Items |
|---|---|
| **Operations** | Trucks, Trailers, Drivers, Fleet Loads, Agency Loads, CRM, Maintenance |
| **Safety & Compliance** | Safety, Incidents, Driver Performance, Documents |
| **Back Office** | Finance & P/L, Company Insights, IFTA Reporting, Settings |

Dashboards section remains at the top, non-collapsible (it's role-specific and always needed).

**2. Collapsible mechanism:**
Use the `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` components (already installed) to wrap each group. Each group header has a `ChevronRight` icon that rotates on open. 

**3. Persist open/closed state:**
Store group open states in `localStorage` key `sidebar-groups`. On mount, restore. Default: all open.

**4. Active route styling:**
Replace the current subtle `data-[active=true]:bg-primary/10` with a stronger `data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold` plus a left border accent via `data-[active=true]:border-l-2 data-[active=true]:border-primary`.

**5. Auto-expand active group:**
On mount/route change, if the active route is inside a collapsed group, auto-expand that group.

### Files

| File | Action |
|---|---|
| `src/components/layout/AppSidebar.tsx` | Rewrite nav group rendering with Collapsible, new groupings, stronger active styles, localStorage persistence |

