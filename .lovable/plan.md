

## Plan: Landstar-Integrated Fuel Trip Planner for Drivers

### Overview

Build a Fuel Trip Planner accessible from the driver dashboard that helps drivers find the cheapest fuel stops along their active/upcoming load routes. The system will attempt to pull fuel data from Landstar's portal (LCAPP) and fall back to public diesel price data when scraping is unavailable.

---

### Architecture

The feature has three layers:

1. **Edge Function** (`landstar-fuel-stops`): Attempts to authenticate with Landstar's portal and scrape fuel stop data. Falls back to publicly available DOE/EIA diesel price data by state.
2. **Fuel Stop Database Table** (`fuel_stops_cache`): Caches scraped/fetched fuel stop data to avoid hammering external sources.
3. **Driver UI Component** (`TripFuelPlanner`): Map-based trip planner showing fuel stops along the route with prices, LCAPP discount indicators, and estimated fuel costs.

---

### Part 1: Database Setup

**New table: `fuel_stops_cache`**

Caches fuel stop data fetched from Landstar or public sources so we don't scrape on every page load.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | Truck stop name (e.g., "Pilot #4521") |
| chain | text | Chain name (e.g., "Pilot/Flying J", "Love's") |
| latitude | numeric | |
| longitude | numeric | |
| state | text | 2-letter state code |
| city | text | |
| diesel_price | numeric | Price per gallon |
| lcapp_discount | numeric | LCAPP cents-off discount (null if not LCAPP partner) |
| net_price | numeric | diesel_price minus lcapp_discount |
| amenities | text[] | Array of amenities (showers, parking, DEF, etc.) |
| source | text | 'landstar', 'doe', or 'manual' |
| fetched_at | timestamptz | When this data was last fetched |
| created_at | timestamptz | |

**RLS Policies:**
- Drivers can SELECT (view fuel stops)
- Operations access can SELECT
- Owner can manage (ALL)

---

### Part 2: Edge Function (`landstar-fuel-stops`)

**Per-driver credentials:** Each driver stores their own Landstar username/password in `driver_settings` table (columns: `landstar_username`, `landstar_password`). The edge function fetches these per-driver using the service role key.

**Flow:**

1. Receive request with `driver_id`, `origin` (lat/lng), `destination` (lat/lng), and optional `corridor_miles` (default 25 miles off-route)
2. **Attempt Landstar scrape:**
   - Fetch driver's Landstar credentials from `driver_settings`
   - POST to Landstar's login endpoint with the driver's credentials
   - If authentication succeeds, navigate to their fuel stops/LCAPP page
   - Parse the HTML response for fuel stop locations, prices, and discounts
   - If scraping fails at any point, log the error and fall back
3. **Fallback: Public diesel prices:**
   - Fetch current average diesel prices by state from the EIA (U.S. Energy Information Administration) open data API (free, no key needed)
   - Combine with a built-in directory of known LCAPP partner truck stop chains and their typical locations along major interstates
4. **Route filtering:**
   - Given origin/destination, calculate a bounding box corridor
   - Filter fuel stops that fall within the corridor
   - Sort by net price (cheapest first)
5. **Cache results** in `fuel_stops_cache` table (TTL: 6 hours)
6. Return sorted fuel stops with prices, distances from route, and LCAPP savings indicators

**Built-in LCAPP Partner Directory:**
The edge function includes a hardcoded list of major LCAPP partner chains that Landstar BCOs get discounts at:
- Pilot/Flying J (typically $0.08-0.25/gal off)
- Love's Travel Stops
- TA/Petro
- Sapp Bros
- Casey's General Stores
- Buc-ee's

This data is always available even when scraping fails.

---

### Part 3: Driver UI - Trip Fuel Planner

**New component: `src/components/driver/TripFuelPlanner.tsx`**

A card on the driver dashboard (below the active load card) that appears when the driver has an active or upcoming load.

**Layout:**
- **Header:** "Fuel Trip Planner" with a fuel pump icon
- **Route Summary:** Shows origin, destination, total miles, and estimated fuel needed (based on truck's avg MPG from `fuel_purchases` data or default 6.5 MPG)
- **Interactive Map:** Uses existing Leaflet setup to show:
  - The route line (origin to destination)
  - Fuel stop markers along the route (color-coded: green for LCAPP partners, blue for others)
  - Clicking a marker shows a popup with stop name, price, LCAPP discount, and amenities
- **Fuel Stops List:** Below the map, a scrollable list of recommended stops sorted by net price:
  - Stop name and chain
  - Distance from route / distance from origin
  - Diesel price and LCAPP discount badge
  - Estimated fill cost (based on tank size estimate)
- **Trip Cost Estimate:** Summary card at the bottom showing:
  - Estimated gallons needed for the trip
  - Cheapest fuel cost (if using recommended stops)
  - Potential LCAPP savings vs. retail average
- **Data freshness indicator:** Shows when fuel prices were last updated, with a "Refresh" button

**Integration with Active Load:**
- Automatically uses the active load's origin/destination
- If no active load, shows a manual origin/destination input
- Works for upcoming loads too (driver can tap an upcoming load to plan fuel)

---

### Part 4: Integration Points

**File: `src/pages/DriverDashboard.tsx`**
- Import and add `TripFuelPlanner` component below the `ActiveLoadCard`
- Pass the active load's origin, destination, and booked_miles
- Only render when the driver has an active or upcoming load

**File: `src/components/driver/ActiveLoadCard.tsx`**
- Add a small "Plan Fuel" button that scrolls to or opens the fuel planner section

---

### Technical Summary

| Action | File/Resource | Details |
|--------|---------------|---------|
| Migration | New SQL migration | Create `fuel_stops_cache` table with RLS policies |
| DB columns | `driver_settings.landstar_username` | Per-driver Landstar portal username |
| DB columns | `driver_settings.landstar_password` | Per-driver Landstar portal password |
| Edge function | `supabase/functions/landstar-fuel-stops/index.ts` | Scrape Landstar + EIA fallback, return fuel stops along route |
| New component | `src/components/driver/TripFuelPlanner.tsx` | Map-based fuel trip planner card |
| Modify | `src/pages/DriverDashboard.tsx` | Add TripFuelPlanner below active load |
| Config | `supabase/config.toml` | Add landstar-fuel-stops function entry |

### Important Caveats

- **Landstar scraping is fragile.** If Landstar changes their portal login flow, adds CAPTCHA, or uses JavaScript-rendered pages, the scraper will break. The fallback to public EIA data ensures the feature always works.
- **Fuel prices are estimates.** Even the DOE/EIA data is averaged by state/region, not per-station. The LCAPP discount amounts are based on publicly known ranges and may differ from actual Landstar-negotiated rates.
- **The scraper will be built with the best available information** about Landstar's portal structure. If their auth flow blocks the initial attempt, the feature still delivers value through the public data + LCAPP partner directory + route planning.

