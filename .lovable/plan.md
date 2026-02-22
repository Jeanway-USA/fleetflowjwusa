

## Unified Load Details Dialog for Active Loads Board

When "View Details" is clicked on the dispatcher's Active Loads board, it will open an inline dialog matching the same design used on the Driver Dashboard's ActiveLoadCard -- ensuring visual consistency across the app.

### What Changes

**File: `src/components/dispatcher/ActiveLoadsBoard.tsx`**

1. **Expand the query** to also fetch `pickup_time`, `delivery_time`, `notes`, `empty_miles`, and `load_accessorials(amount)` so the dialog has all the data it needs.

2. **Add dialog state** (`detailsOpen`, `selectedLoad`) to track which load's detail sheet is showing.

3. **Replace the "View Details" dropdown action** so it sets `selectedLoad` and opens the dialog instead of navigating to `/fleet-loads`.

4. **Render a `Dialog`** at the bottom of the component that mirrors the ActiveLoadCard detail dialog:
   - Status badge with colored background
   - Origin with pickup date/time
   - Destination with delivery date/time
   - Route map preview (reusing `LoadRouteMap`)
   - Booked Miles row
   - Rate display
   - Special Instructions section (reusing the same formatting logic from ActiveLoadCard)

### Technical Details

- Reuses the existing `LoadRouteMap` component from `@/components/driver/LoadRouteMap`
- Reuses the `formatSpecialInstructions` helper (extracted or duplicated from ActiveLoadCard)
- Imports `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from the shared UI library
- The dialog width will be `max-w-lg` to match the driver dashboard's detail dialog
- No new components or files needed -- all changes are within `ActiveLoadsBoard.tsx`

