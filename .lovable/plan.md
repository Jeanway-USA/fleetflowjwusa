## Fix: Driver Settings RLS violation when saving weekly goals

### Root cause
`driver_settings` RLS requires both `driver_id` and `org_id` to match the current user (`get_user_org_id(auth.uid())`). The save mutation in `src/pages/DriverSettings.tsx` omits `org_id`:
- **Insert** path: never sets `org_id` → WITH CHECK fails.
- **Update** path: if an existing row has `org_id = NULL` (legacy), the post-update row still fails the WITH CHECK.

### Change
Edit `src/pages/DriverSettings.tsx` `saveGoalsMutation`:

1. Read the driver's `org_id` (already available — `driver` query fetches the driver record; if it doesn't include `org_id`, add it to the select).
2. Include `org_id: driver.org_id` in both the `.insert(...)` and `.update(...)` payloads.
3. Guard: throw a clear error if `org_id` is missing before calling Supabase.

No DB migration needed — the RLS policy is correct; the client just needs to send `org_id`.

### Verification
- Click "Save Goals" as a driver → success toast, no RLS error.
- Row in `driver_settings` has correct `org_id`.