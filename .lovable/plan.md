

## Plan: Route Map Preview on Load Card + Fuel/MPG Tracking on Driver Stats

### Feature 1: Route Map Preview on ActiveLoadCard

Add an inline Leaflet mini-map inside the ActiveLoadCard showing origin and destination markers connected by a dashed route line. The map will geocode the load's origin and destination addresses on render and display a compact, non-interactive route overview.

**New Component:** `src/components/driver/LoadRouteMap.tsx`
- A self-contained mini-map component that accepts `origin` and `destination` strings
- Uses the existing `geocodeLocationAsync` function from `src/lib/geocoding.ts` to convert addresses to coordinates
- Renders a Leaflet `MapContainer` with:
  - Green circle marker at origin
  - Red pin marker at destination
  - Dashed polyline connecting them
  - Auto-fit bounds to show the full route
- Compact height (~160px) with rounded corners
- Shows a loading skeleton while geocoding
- Gracefully hides the map if geocoding fails for both addresses
- Reuses the same Leaflet icon patterns from `FleetMapView.tsx` for consistency

**Modified File:** `src/components/driver/ActiveLoadCard.tsx`
- Import and render the `LoadRouteMap` component between the Route Info section and the Action Buttons Row
- Pass `load.origin` and `load.destination` as props
- Only render the map when origin and destination are available

---

### Feature 2: Fuel/MPG Metrics on Driver Stats Page

Display fuel purchase data and calculated MPG (miles per gallon) on the existing Driver Stats page. This uses the existing `fuel_purchases` table which already has a `driver_id` column, so no database changes are needed.

**Modified File:** `src/pages/DriverStats.tsx`

Add a new query to fetch fuel purchases for the driver within the selected period:
```
fuel_purchases WHERE driver_id = driver.id 
  AND purchase_date >= dateRange.start 
  AND purchase_date <= dateRange.end
```

Add a new "Fuel & Efficiency" card below the Mileage Breakdown card containing:
- **Total Gallons** purchased in the period
- **Total Fuel Cost** for the period
- **Average MPG** calculated as: total loaded miles / total gallons
- **Avg Cost per Mile** calculated as: total fuel cost / total loaded miles
- A colored MPG indicator:
  - Green if MPG >= 6.5 (good for a semi-truck)
  - Yellow/Warning if MPG is between 5.5 and 6.5
  - Red if MPG < 5.5

The card uses the same period toggle (weekly/monthly/annual) that already controls the other stats, so fuel data filters automatically.

**RLS Consideration:** The `fuel_purchases` table already has a policy allowing drivers to view their own fuel purchases (`driver_id = get_driver_id_for_user(auth.uid())`), so no database changes are needed.

---

### Technical Details

**Files to Create:**
| File | Purpose |
|------|---------|
| `src/components/driver/LoadRouteMap.tsx` | Inline Leaflet mini-map for origin-to-destination route |

**Files to Modify:**
| File | Change |
|------|--------|
| `src/components/driver/ActiveLoadCard.tsx` | Add `LoadRouteMap` component between route info and action buttons |
| `src/pages/DriverStats.tsx` | Add fuel purchase query and "Fuel and Efficiency" stats card |

**No database migrations required** -- both features use existing tables and columns (`fleet_loads.origin/destination` for geocoding, `fuel_purchases` for MPG).

**Dependencies:** No new packages needed -- Leaflet and react-leaflet are already installed.

