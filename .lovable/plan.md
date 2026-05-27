## Make Maintenance tabs respect `?tab=` query param

The "Manage inventory" link already navigates to `/maintenance?tab=inventory`, but `MaintenanceManagement.tsx` uses `<Tabs defaultValue="active">` and never reads the query param, so it always lands on Active Work Orders.

### Change

In `src/pages/MaintenanceManagement.tsx`:

1. Derive the active tab from `searchParams.get('tab')`, falling back to `'active'`. Allowed values: `active | pm | predictive | history | inventory`.
2. Convert `<Tabs>` to controlled: pass `value={activeTab}` and `onValueChange` that updates the URL via `setSearchParams` (preserving other params, `replace: true`) so deep links and tab clicks stay in sync.

No other files need changes — the dashboard link already targets `?tab=inventory`.