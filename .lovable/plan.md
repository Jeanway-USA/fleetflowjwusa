## Plan: make saved live routes persist and render everywhere

### 1. Persist the live route from the same update that saves GPS
- Change the driver location update flow so the active route recalculation runs after an accepted GPS save, not only from the browser watcher callback.
- Make the route updater return a success/failure result and log useful failure details so blocked writes are visible.
- Lower the route update gates enough for testing/live tracking responsiveness while keeping debounce protection.

### 2. Ensure drivers are allowed to write only route persistence fields
- Add a database migration to explicitly keep `current_route_geometry`, `current_route_origin`, and `current_route_updated_at` writable by the assigned driver while preserving restrictions on financial, assignment, and customer-sensitive fields.
- Verify existing `fleet_loads` RLS still only lets assigned drivers update their own load rows.

### 3. Remove dispatcher-only in-memory route overrides
- Update `FleetMapView` so dispatcher live routes come from saved `fleet_loads.current_route_geometry` first.
- Remove/disable the dispatcher-side temporary route recalculation that currently draws a new route in memory without saving it, because that can make the UI look live until refresh and then revert.

### 4. Make the driver/public map truly live-route-first
- Update `LoadRouteMap` so when saved live geometry exists, it does not wait for or visually compete with the static origin-to-destination route.
- For public tracking, keep polling the public tracking function and pass saved geometry into the map as the source of truth.

### 5. Verify the fix
- Use read-only database checks to confirm the column and policy/trigger state.
- After implementation, verify the changed code paths and run the relevant targeted checks available in the project.