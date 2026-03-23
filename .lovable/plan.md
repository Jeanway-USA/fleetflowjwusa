

## Fix: Morning Briefing Alert Routes

### Problem
The "Missing PODs" badge links to `/loads?status=delivered` which doesn't exist — the actual page is `/fleet-loads`. Similarly, the "Loads Picking Up Today" badge links to `/loads?status=assigned`, also non-existent. Both result in a 404.

Additionally, the FleetLoads page doesn't consume a `status` query parameter for filtering, so even with the correct base route, the filter wouldn't apply.

### Solution
Update both load-related routes in `MorningBriefingWidget.tsx`:

| Badge | Current Route | New Route |
|-------|--------------|-----------|
| Loads Picking Up Today | `/loads?status=assigned` | `/fleet-loads` |
| Delivered Loads Missing PODs | `/loads?status=delivered` | `/fleet-loads` |

### File
| File | Change |
|------|--------|
| `src/components/executive/MorningBriefingWidget.tsx` | Fix routes on lines 124 and 157 from `/loads?status=...` to `/fleet-loads` |

