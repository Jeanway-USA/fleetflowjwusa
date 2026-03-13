

## Plan: Add "POD Required" Toggle to Fleet Loads

### Overview
Add a `pod_required` boolean column to `fleet_loads` and a toggle in the load form. When a driver completes a load where POD is not required, skip the POD dialog and mark delivered directly.

### 1. Database Migration
Add column to `fleet_loads`:
```sql
ALTER TABLE public.fleet_loads ADD COLUMN pod_required boolean NOT NULL DEFAULT true;
```
Default `true` so existing loads still require POD.

### 2. FleetLoads Form (`src/pages/FleetLoads.tsx`)
Add a toggle row below the existing "Auto Email Updates" toggle (lines 792-804), styled identically:
- Label: "POD Required"
- Description: "Require Transflo POD link and signature on delivery"
- Switch bound to `formData.pod_required ?? true`

### 3. Driver ActiveLoadCard (`src/components/driver/ActiveLoadCard.tsx`)
Update the `handleProgressStatus` function (line 173-177). Currently it always opens the POD dialog when transitioning to delivered. Change to:
- If `load.pod_required === false`, update status to `delivered` directly (same as other status transitions)
- If `load.pod_required` is true or undefined, open POD dialog as before

This requires `pod_required` to be part of the load data already fetched (it will be, since the query uses `select('*')` or includes all columns).

### Files to Edit
- **Database**: 1 migration adding `pod_required` column
- `src/pages/FleetLoads.tsx`: Add toggle in form (~8 lines)
- `src/components/driver/ActiveLoadCard.tsx`: Conditional POD dialog (~5 lines changed)

