
# IFTA Reporting Enhancements

## Overview

Two major improvements to the IFTA Reporting page:
1. **Sync Fuel Purchases from Expenses** -- A button that automatically finds Fuel/DEF expenses linked to loads and syncs them into the fuel purchases table with jurisdiction data.
2. **Interactive Jurisdiction Summary Map** -- A Leaflet-based US map that visually shows tax owed/credited per state, replacing the basic table.

---

## Feature 1: Sync Fuel Purchases from Load Expenses

### The Problem
Currently, there are 8 Fuel/DEF expenses in the system with vendor names like "PILOT #12" and "TA WHEAT RIDGE" -- but none have jurisdiction (state) set. Without a jurisdiction, the existing database trigger cannot sync them into the fuel_purchases table used for IFTA reporting. The vendor names alone often lack a state abbreviation, but the expenses *are* linked to loads which have full addresses with state info.

### The Solution
Add a "Sync from Expenses" button on the Fuel Purchases tab that:
1. Fetches all Fuel/DEF expenses for the selected quarter
2. Finds expenses not yet synced (no matching `fuel_purchase` via `source_expense_id`)
3. Determines jurisdiction by:
   - First checking if the expense already has a jurisdiction set
   - Trying to extract state from vendor string (e.g., "PILOT DALLAS TX")
   - Falling back to the linked load's origin/destination addresses to find the state
4. Updates the expense's `jurisdiction` field in the database
5. The existing `sync_fuel_expense_to_ifta` database trigger automatically creates the corresponding `fuel_purchases` record

### UI Changes (IFTA.tsx)
- Add a "Sync from Expenses" button next to "Add Fuel Purchase" in the Fuel Purchases tab header
- Show a loading spinner during sync
- Display a toast with results (e.g., "Synced 5 of 8 fuel expenses")

---

## Feature 2: Interactive Jurisdiction Summary Map

### The Problem
The current "Jurisdiction Summary" tab shows a basic table with fuel-by-state data but lacks the comprehensive IFTA tax view. It doesn't show tax liability or use the IFTA records.

### The Solution
Replace the Jurisdiction Summary tab content with:

1. **US Map with State Markers** -- A Leaflet map centered on the continental US showing circle markers at each state's geographic center, color-coded:
   - Red circles = Tax owed to that state
   - Green circles = Tax credit from that state  
   - Circle size proportional to the amount
   - Popups showing breakdown: miles driven, gallons purchased, gallons consumed, tax rate, net tax

2. **Enhanced Summary Table Below the Map** -- A comprehensive table combining data from both IFTA records (miles/tax) and fuel purchases (gallons/cost) per state, including:
   - State name
   - Total miles driven
   - Gallons purchased in state
   - Gallons consumed (miles / fleet MPG)
   - Tax rate
   - Tax owed/credit
   - Net position (color-coded)

### New Component
Create `src/components/ifta/JurisdictionMap.tsx`:
- Uses Leaflet (already installed) with `react-leaflet`
- State center coordinates stored as a static lookup object
- Accepts IFTA records and fuel purchase data as props
- Color-coded circle markers with interactive popups

---

## Technical Details

### Files to Create
- `src/components/ifta/JurisdictionMap.tsx` -- New Leaflet-based US map component
- `src/lib/state-coordinates.ts` -- US state center lat/lng coordinates lookup

### Files to Modify
- `src/pages/IFTA.tsx` -- Add sync button, integrate new map component, enhance jurisdiction summary tab

### Data Flow for Sync

```text
User clicks "Sync from Expenses"
        |
        v
Fetch Fuel/DEF expenses for selected quarter
        |
        v
For each unsynced expense:
  1. Try extractJurisdictionFromVendor(vendor)
  2. If no match, fetch linked load's origin/destination
  3. Extract state from load addresses
        |
        v
Update expense.jurisdiction in database
        |
        v
DB trigger (sync_fuel_expense_to_ifta) fires automatically
        |
        v
fuel_purchases record created/updated with source_expense_id link
        |
        v
Invalidate queries to refresh UI
```

### Dependencies
No new dependencies needed -- Leaflet and react-leaflet are already installed.
