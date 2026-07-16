
## Sidebar polish & regrouping

Refine `src/components/layout/AppSidebar.tsx` only. No routing, auth, or data changes. Existing role/tier/tmsMode filtering, simulation mode, branding header, workspace switcher, footer, and `collapsible="icon"` behavior stay intact.

### 1. Regroup nav items

Replace the current four groups (Operations / Fleet Care / Safety & Compliance / Administration) with a cleaner taxonomy that matches how users think about the product:

```text
DASHBOARDS            (non-collapsible, role-aware — unchanged)
  Executive / Dispatcher / Driver / Maintenance views

OPERATIONS
  Fleet Loads, Agency Loads, Drivers, Trucks, Trailers

FINANCE
  Finance & P/L, Tax Hub, IFTA Reporting  (Settlements link stays inside Finance page)

COMPLIANCE & SAFETY
  Safety, Incidents, Driver Performance, Maintenance, Documents, Document Signing

CRM & SALES
  Broker/Agent CRM (label already mode-aware)

REPORTS & INSIGHTS
  Company Insights, Audit Trail, Archive

SETTINGS & ADMIN     (collapsed by default for everyone; owners only)
  Settings
```

Group memberships are set per nav item; role/tier filtering already hides items the user can't see, so empty groups auto-hide via the existing `if (items.length === 0) return null` guard in `CollapsibleNavGroup`.

### 2. Default-open logic

- Open by default: Operations, Finance, Compliance & Safety, CRM & Sales.
- Collapsed by default: Reports & Insights, Settings & Admin.
- Keep the existing "auto-expand the group containing the active route" effect and the `localStorage` persistence (`sidebar-groups` key) so user overrides stick.

### 3. Visual polish

Inside `CollapsibleNavGroup` and the Dashboards block:

- Group header: bump spacing to `px-3 pt-4 pb-1.5`, keep uppercase 11px tracking, add a subtle `text-muted-foreground/70` and hover `text-foreground`.
- Add a thin `border-t border-sidebar-border/50` between adjacent groups (skip before the first group) for clearer visual separation.
- Menu buttons: tighten to `h-9`, `gap-2.5`, `rounded-md`, `text-sm`.
- Hover: `hover:bg-sidebar-accent/60`.
- Active state: replace the current `border-l-2` treatment with a full pill — `bg-primary/10 text-primary font-medium` plus a 3px left accent bar via a `::before` pseudo (using an absolutely positioned `<span>` since Tailwind pseudo-content is awkward). Keeps the active row obvious without shifting content on hover.
- Icons: `h-4 w-4 shrink-0`, `text-muted-foreground` at rest, `text-primary` when active.
- Chevron on group headers: keep the existing rotate animation, size `h-3.5 w-3.5`.

### 4. Icon-collapsed mode

`Sidebar collapsible="icon"` already collapses to a rail. Verify group labels hide (Tailwind `group-data-[collapsible=icon]:hidden` on the header text and chevron container) so only icons render in rail mode. No structural change beyond that class addition.

### 5. Role visibility (unchanged mechanics, updated mapping)

Reuse `filterByRoleAndTier`. New group→items mapping:

- Finance items keep `roles: ['owner', 'payroll_admin']` and their existing `feature` gates.
- Reports & Insights: Company Insights (`insights`), Audit Trail (owner/payroll_admin), Archive (multi-role, already correct).
- Settings & Admin: only `Settings` for owners not currently simulating (existing `actuallyIsOwner && !isSimulating` check moves here).

### 6. Out of scope

- No changes to `TopBar`, `DashboardLayout`, routes, or `useSubscriptionTier`.
- Sidebar header (logo + workspace switcher) and footer (sign-out) untouched.
- Mobile drawer already handled by `SidebarProvider`; no extra work.

### Technical notes

- All colors via existing sidebar semantic tokens (`--sidebar-border`, `--sidebar-accent`, `--primary`, `--muted-foreground`) — no hardcoded hex.
- Keep `data-tour` attributes (`nav-fleet-loads`, `nav-finance`, `sidebar-nav`) on their current items so the product tour keeps working.
- Update `STORAGE_KEY` defaults object to include the new group keys (`operations`, `finance`, `compliance`, `crm`, `reports`, `admin`) — old `fleetcare`/`safety`/`administration` keys become stale but harmless.
