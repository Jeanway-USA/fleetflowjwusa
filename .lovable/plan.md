
# Remove All Hours of Service (HOS) References

Since HOS is managed entirely by your separate ELD hardware in the truck, we'll clean out all HOS-related code from the website.

## Changes

### 1. Dispatcher Dashboard -- Remove HOS Overview card
**File: `src/pages/DispatcherDashboard.tsx`**
- Remove the `DriverHOSOverview` import (line 18)
- Remove `<DriverHOSOverview />` from the Fleet Status Grid (line 200)
- The grid will show just Driver Status and Truck Status (2 columns instead of 3, adjust grid to `md:grid-cols-2`)

### 2. Delete HOS component files
- Delete `src/components/dispatcher/DriverHOSOverview.tsx`
- Delete `src/components/driver/HOSStatusCard.tsx`

These are standalone components with no other imports depending on them.

### 3. No database changes needed
The `hos_logs` table will remain in the database but simply won't be used by the UI. Removing the table would require a migration and there's no harm in leaving it -- it just won't be referenced by any frontend code.

## Result
The Dispatcher Dashboard's Fleet Status section will show a clean 2-column grid with Driver Status and Truck Status only. No HOS references will remain anywhere in the UI.
