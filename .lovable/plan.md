

## Public Load Tracker

### Overview
Create a public-facing load tracking page accessible without authentication. Uses a unique `tracking_id` (UUID) on each load, served via a backend function that bypasses auth to return only safe, non-sensitive data.

### Database Changes
1. **Add `tracking_id` column** to `fleet_loads`:
   - `tracking_id UUID DEFAULT gen_random_uuid() UNIQUE`
   - Auto-populated for all existing and new loads

### Backend Function: `public-load-tracker`
A new edge function that accepts `?tracking_id=<uuid>` and returns:
- Load: origin city/state, destination city/state, status, pickup_date, delivery_date
- Organization: name, logo_url, primary_color
- Driver location: latitude, longitude, updated_at (only if `is_sharing = true`)

Uses the service role key to bypass RLS. Returns only non-sensitive fields (no rates, driver names, financial data).

### New Page: `src/pages/PublicLoadTracker.tsx`
- **Route**: `/track?tracking_id=<uuid>` (public, no auth)
- **Layout**: Standalone page (no sidebar/header), not wrapped in ProtectedRoute
- **UI Components**:
  - Org logo at top (fetched from edge function response), fallback to app name
  - Brand color applied via inline CSS variable
  - Load number and route (city, state only)
  - **3-step progress bar**: Dispatched → In Transit → Delivered (using simple styled divs, not the Progress component)
  - **ExpandableMap** showing the route polyline plus a truck marker if live GPS is available
  - "Last updated" timestamp for location freshness
  - Graceful states: loading spinner, "tracking not found", "load delivered"

### ActiveLoadCard.tsx Changes
- Add a "Share Tracking" button (Link icon) next to "Load Details"
- On click: constructs URL `${window.location.origin}/track?tracking_id=${load.tracking_id}` and copies to clipboard via `navigator.clipboard.writeText()`
- Shows toast confirmation "Tracking link copied!"
- Only visible when `load.tracking_id` exists

### App.tsx Changes
- Add lazy import for PublicLoadTracker
- Add `<Route path="/track" element={<PublicLoadTracker />} />` in the public routes section (alongside `/auth`, `/pricing`)

### Files Modified/Created
| File | Action |
|---|---|
| Migration | Add `tracking_id` column to `fleet_loads` |
| `supabase/functions/public-load-tracker/index.ts` | New edge function for public data access |
| `src/pages/PublicLoadTracker.tsx` | New public tracking page |
| `src/App.tsx` | Add `/track` public route |
| `src/components/driver/ActiveLoadCard.tsx` | Add "Share Tracking" button |

### Security
- Edge function returns only: origin/destination (city+state), status, dates, org name/logo, and GPS coords (if sharing)
- No financial data, driver PII, or internal IDs exposed
- `tracking_id` is a random UUID — not guessable from load IDs

