## Goal
Eliminate Driver Vehicle Inspection Report (DVIR), Pre-Trip and Post-Trip functionality to avoid double-logging with the ELD.

## Findings from exploration
- `src/pages/DriverDashboard.tsx` currently does **not** import or render any of the DVIR components — no UI gap to repair there.
- `src/components/layout/AppSidebar.tsx` has **no nav link** to Inspections/DVIR. The string `'dvir'` only appears inside tier feature-flag arrays.
- Other DVIR-coupled code exists beyond the user's list:
  - `src/components/safety/InspectionHistory.tsx` (DVIR history table on Safety page)
  - `src/components/safety/DefectAlerts.tsx` (DVIR defect alerts on Safety page)
  - `src/pages/Safety.tsx` renders both of the above and a "Work Order Sheet for DVIR conversion"
  - `src/hooks/useOfflineSync.ts` + `src/hooks/useOfflineQueue.ts` queue `dvir_inspection` actions
  - `src/lib/tour-steps.ts` has a driver-tour step targeting `[data-tour="dvir-buttons"]`
  - `'dvir'` feature flag in `useSubscriptionTier.ts`, `AppSidebar.tsx`, `CommandPalette.tsx`
  - Note: Safety.tsx also has annual DOT **truck inspection date** alerts (`next_inspection_date`) — these are *not* DVIR and will stay.

## Plan

### 1. Delete files (as requested)
- `src/components/driver/DVIRButtons.tsx`
- `src/components/driver/DVIRForm.tsx`
- `src/components/driver/DVIRHistory.tsx`
- `src/components/driver/PreTripForm.tsx`
- `src/components/driver/PostTripForm.tsx`

### 2. `src/pages/DriverDashboard.tsx`
No DVIR imports currently present — no changes needed. (Will verify after deletions.)

### 3. `src/components/layout/AppSidebar.tsx`
No DVIR nav link exists. Remove `'dvir'` from the tier feature-flag arrays so it's no longer gated as a feature.

### 4. Extended cleanup (to fully remove DVIR — beyond user's explicit list)
- **Delete** `src/components/safety/InspectionHistory.tsx` and `src/components/safety/DefectAlerts.tsx`.
- **Edit** `src/pages/Safety.tsx`: remove `InspectionHistory` import + render, remove DVIR work-order sheet bits, keep the DOT annual truck-inspection alerts.
- **Edit** `src/lib/tour-steps.ts`: remove the `dvir-buttons` driver tour step.
- **Edit** `src/hooks/useOfflineQueue.ts`: drop `'dvir_inspection'` from `OfflineActionType` and its case branch.
- **Delete** `src/hooks/useOfflineSync.ts` (entirely DVIR-related) — or, if other imports exist, gut it to a no-op. Will verify usages before deleting.
- **Edit** `src/hooks/useSubscriptionTier.ts` and `src/components/shared/CommandPalette.tsx`: remove `'dvir'` from feature-flag arrays.

### 5. Out of scope (kept intentionally)
- Database tables (`driver_inspections`, `dvir-photos`/`dvir-signatures` storage buckets) — left untouched to preserve historical records. Mention to the user; can be dropped in a follow-up migration if desired.
- DOT annual truck inspection date tracking on Safety page — unrelated to DVIR.

## Verification
After edits, run a grep for `DVIR|dvir|PreTrip|PostTrip|pre_trip|post_trip` across `src/` and confirm only intentional references remain (e.g., DB type strings if any). Confirm build passes.
