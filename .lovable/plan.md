## Goal

Turn `src/components/shared/CommandPalette.tsx` into a keyboard-first dispatcher tool: global Ctrl/Cmd+K open, full arrow/enter navigation (already provided by shadcn `Command`), dispatcher quick actions, and live search across CRM contacts + active loads simultaneously.

## Changes

### 1. Keep existing global shortcut
- `Ctrl/Cmd + K` toggle is already wired in the component and mounted globally via `DashboardLayout`. Verify and keep.
- Add `Esc` close (already built into `CommandDialog`).
- Add a small "⌘K" hint in the dashboard header so users discover it.

### 2. Add dispatcher quick actions
Extend `QUICK_ACTIONS` (visible to `owner` + `dispatcher`):
- **New Load** → `/fleet-loads?action=new-load` (already exists, keep)
- **Assign Driver** → `/dispatcher-dashboard?action=assign-driver` (opens the existing DriverAssignmentPanel modal)
- **Change Load Status** → `/fleet-loads?action=bulk-status` (opens existing BulkStatusEditDialog)
- **Search Broker** → focuses the palette input prefixed with `broker:` to filter CRM results to brokers
- Keep existing New Maintenance / Upload Expense entries

For the two new dashboard/loads actions, wire the receiving pages to read the `?action=` query param on mount and open the corresponding dialog (pattern already used elsewhere in the app — `FleetLoads` reads `action=new-load`).

### 3. Live search across CRM + active loads
Add a debounced search (~200ms) on the palette input. When `query.length >= 2`:

- Query `crm_contacts` (`select id, company_name, contact_name, contact_type, city, state`) — `ilike` on `company_name`, `contact_name`, `email`; limit 8; filter by `is_active=true`.
- Query `fleet_loads` (`select id, load_number, origin, destination, status, driver_id`) — `ilike` on `load_number`, `origin`, `destination`; exclude `status in (delivered, cancelled)`; limit 8.
- Run both with `Promise.all` inside a `useQuery(['palette-search', query])` with `staleTime: 30s` and `enabled: query.length >= 2`.
- RLS already scopes results to the user's org — no extra filter needed.

Render two new `CommandGroup`s above Navigation:
- **Contacts** — icon by contact_type, label `company_name — contact_name`, sub `city, state`. Selecting navigates to `/crm?contactId=<id>` (CRM page already supports opening the detail sheet via query param; if not, add a small effect there).
- **Active Loads** — label `#load_number  origin → destination`, status badge. Selecting navigates to `/fleet-loads?loadId=<id>`.

Keep existing Navigation + Quick Actions groups visible when query is empty; hide them once a search is active to keep results focused (optional: still show Quick Actions).

### 4. Keyboard navigation
shadcn `Command` (cmdk) already handles ↑/↓/Enter/typeahead. No extra work beyond making sure each `CommandItem` has a stable `value` prop so cmdk's fuzzy filter doesn't fight the async results — we'll set `shouldFilter={false}` on the `Command` when a remote query is active and rely on the server `ilike`.

### 5. Loading + empty states
- Show a `CommandLoading` row ("Searching…") while the query is pending.
- Keep `CommandEmpty` for "No results found."

### 6. Files to touch

- `src/components/shared/CommandPalette.tsx` — main rewrite (add search, groups, actions, debounce, query).
- `src/pages/DispatcherDashboard.tsx` — handle `?action=assign-driver` to open the assignment panel.
- `src/pages/FleetLoads.tsx` — handle `?action=bulk-status` and `?loadId=` (loadId may already exist; verify).
- `src/pages/CRM.tsx` — handle `?contactId=` to open the contact detail sheet (verify; add if missing).
- `src/components/layout/DashboardLayout.tsx` — add small "⌘K" hint button in header that opens the palette (dispatch a custom event the palette listens for, or lift `open` state via a tiny zustand/context — simplest: dispatch `window` event `open-command-palette`).

### Technical notes

- Use existing `supabase` client; no new deps.
- Debounce via `useDebouncedCallback` (already in `src/hooks/`).
- All new colors/icons use existing semantic tokens — no design-system changes.
- Demo mode: searches still work (read-only); quick actions that mutate are already guarded by `useDemoGuard` on their target pages.
