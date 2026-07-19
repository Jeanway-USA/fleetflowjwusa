# QoL Polish: Filtering, Bulk Actions, Cards, States, Navbar

Most infrastructure is already in place (soft-delete + Undo, `DataTable` selection + column filters, `EmptyState`, `CommandPalette`, TopBar with theme/search/notifications). This plan closes the gaps consistently rather than rebuilding.

## 1. Advanced Filtering & Bulk Actions

**Shared toolbar component** — `src/components/shared/ListToolbar.tsx`
- Debounced search input (300ms), status multi-select, "More filters" popover slot, active-filter chips with individual clear + "Clear all", result count.
- Reused on Drivers, Trucks, Trailers, AgencyLoads. FleetLoads already has a comparable toolbar — align its styling only.

**Per-page filter additions** (all client-side over existing queries):
- **Drivers**: employment type, compliance status (CDL/medical expiring < 30d / expired), onboarding stage. Already has search + status + sort — extend it.
- **Trucks**: status, assigned/unassigned, PM due (<= threshold), year range.
- **Trailers**: status, type, assigned/unassigned.
- **AgencyLoads**: status, date range (pickup), broker text, margin sign.

**Bulk actions** — extend the existing `bulkActions` slot:
- Drivers: Archive, Export CSV, Set Status.
- Trucks: Archive, Export CSV, Set Status, Assign Driver (opens existing DriverAssignmentSelect in a dialog looping over selection).
- Trailers: Archive, Export CSV, Set Status.
- AgencyLoads: Archive, Export CSV, Set Status (already partial).
- Reuse `DataTable`'s existing CSV export helper for the Export action.

## 2. Drivers Card Design

Redesign the grid-card variant in `src/pages/Drivers.tsx` (list-view untouched):
- Header row: avatar/initials, name, employment-type chip.
- Status badge with tone dot; compliance strip below (CDL expiry, medical, MVR) with amber/red highlight when expiring/expired.
- Quick actions row (always visible on desktop, revealed on tap on mobile): View, Edit, Message, Archive.
- Consistent spacing tokens; hover ring + subtle shadow. No new business logic.

## 3. Empty States & Loading Skeletons

**Skeletons** — `src/components/shared/ListSkeleton.tsx` with `variant="table" | "cards"`:
- Cards: 6 shimmering card placeholders matching the driver-card layout.
- Table: header + 8 row placeholders (already partially in `DataTable`; standardize).
- Wire into Drivers (cards), Trucks, Trailers, AgencyLoads, FleetLoads while `isLoading`.

**Empty states** — enrich `EmptyState`:
- Support a secondary action + optional inline illustration (simple SVG per entity, colored with `--muted-foreground`).
- Distinguish "no records yet" (primary CTA to create) vs "no results for current filters" (CTA to clear filters). Already used in FleetLoads for search-empty — extend to all list pages.

## 4. Top Navbar Polish

`src/components/layout/TopBar.tsx`:
- Tighten spacing/alignment; group left cluster (SidebarTrigger + breadcrumb + beta chip) and right cluster (search, time toggle, theme, notifications, user menu) with consistent `gap-2`.
- **Company switcher** (only if user belongs to >1 org, or is impersonating/super-admin): dropdown next to the breadcrumb showing current org name; picking one calls existing impersonation/switch logic. If only one org, render the org name as a static label to fill the space.
- Notification bell: standardize size (`h-9 w-9`), add unread-count dot animation.
- Search button: unify height with other icon buttons; ensure ⌘K hint visible on md+.
- User menu (`UserMenu.tsx`): show avatar + name + role chip on md+, icon-only on mobile; consistent dropdown widths.

## Technical Details

- No schema changes. All filtering is client-side over already-fetched `useQuery` data.
- `ListToolbar` is presentational; state stays in each page for simplicity.
- Column filters on `DataTable` remain the source of truth for table pages; the toolbar wraps common filters above the table.
- All new UI uses semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`) — no hardcoded colors.
- Company-switcher logic reuses the existing impersonation context; no new backend surface.

## Out of Scope

- Server-side pagination / cursor filtering.
- Redesigning FleetLoads (largest page, already has toolbar) beyond skeleton + toolbar-style alignment.
- Building a new notification system — only visual polish on the existing bell.
