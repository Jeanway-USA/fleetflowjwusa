# Grant Maintenance Staff access to Trucks & Trailers

Small, focused change in two files. No new components, no DB changes.

## 1. `src/App.tsx` — routes

Add `'maintenance'` to the `allowedRoles` on both routes:

- `/trucks` → `allowedRoles={['owner', 'dispatcher', 'safety', 'maintenance']}`
- `/trailers` → `allowedRoles={['owner', 'dispatcher', 'safety', 'maintenance']}`

`requiredFeature="trucks"` / `"trailers"` stays as-is (already enabled across tiers that include maintenance).

## 2. `src/components/layout/AppSidebar.tsx` — nav items

In the existing `operationsItems` array, add `'maintenance'` to the `roles` of the Trucks and Trailers entries:

```ts
{ title: 'Trucks',   icon: Truck,     path: '/trucks',   roles: ['owner', 'dispatcher', 'safety', 'maintenance'], feature: 'trucks' },
{ title: 'Trailers', icon: Container, path: '/trailers', roles: ['owner', 'dispatcher', 'safety', 'maintenance'], feature: 'trailers' },
```

This re-uses the same `Truck` / `Container` icons and styling already used in the Dispatcher/Executive views. For Maintenance users, the existing "Operations" collapsible group will appear automatically containing just these two items — no new group is needed (keeps the sidebar consistent with other roles). If you'd prefer a dedicated "Fleet Assets" group label for maintenance, say the word and I'll add one, but reusing "Operations" avoids divergence.

## 3. Verification

After the edits:
- Sign in / simulate as a Maintenance user.
- Confirm "Operations → Trucks" and "Operations → Trailers" appear in the sidebar with the truck and container icons.
- Click each; the page should load without the ProtectedRoute redirect.

## Out of scope

- No edits to write/mutation permissions — this is view access only (the Trucks/Trailers pages already gate edit actions by role internally).
- No RLS changes — read access to `trucks`/`trailers` for maintenance is already in place (the maintenance dashboard reads from `useTrucks()` today).
