

## Plan: Add Detail Dialogs for Morning Briefing Alerts

### Problem
Clicking "Loads Picking Up Today" or "Delivered Loads Missing PODs" just navigates to `/fleet-loads`, forcing the user to manually find the relevant loads. The user wants clicking these badges to open a focused popup showing exactly which loads are affected.

### Solution
Replace the `navigate()` behavior for these two badges with dialogs that display the specific loads.

### Changes

**1. Refactor `MorningBriefingWidget.tsx`**
- Change the `BriefingMetric` type: replace `route: string` with `action: 'navigate' | 'dialog'` and `dialogType?: string`
- Add state: `activeDialog: null | 'loads-today' | 'missing-pods'`
- On click: if `action === 'navigate'`, use `navigate()` as before (for drivers/maintenance). If `action === 'dialog'`, set `activeDialog` to show the relevant dialog.

**2. Create `src/components/executive/BriefingLoadsDialog.tsx`**
A reusable dialog component that accepts a `type` prop (`'pickup-today' | 'missing-pod'`) and fetches/displays the relevant loads.

- **Pickup Today**: Queries `fleet_loads` where `pickup_date = today` and `status IN ('assigned', 'booked')`. Displays: Load #, Origin → Destination, Driver, Status.
- **Missing PODs**: Queries `fleet_loads` where `status = 'delivered'` and `pod_required = true`, then cross-references `documents` to exclude loads that already have POD docs. Displays: Load #, Origin → Destination, Delivery Date, Driver.

Both views render in a `Dialog` with a `Table` inside. Each row has a "View" button that navigates to `/fleet-loads` (future: could scroll to that load).

### Files

| File | Action |
|------|--------|
| `src/components/executive/BriefingLoadsDialog.tsx` | Create — dialog showing filtered load lists |
| `src/components/executive/MorningBriefingWidget.tsx` | Edit — open dialog instead of navigating for load-related badges |

