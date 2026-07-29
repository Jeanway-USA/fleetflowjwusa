## Problem (verified)

The load `4 Yawkey Way, Boston, MA 02215-3409` has a stored route destination of `41.2627, -70.06219` — Nantucket.

I reproduced the cause against Mapbox directly. Our `geocode-address` function sends the whole address as a single free-text `q` string. Mapbox returns:

```text
"4 Yawkey Way, Nantucket, Massachusetts 02554"
match_code: { street: matched, postcode: unmatched, place: unmatched, confidence: medium }
```

It matched the street name but ignored the city and ZIP — and we accept it blindly because we only look at `feature_type` for precision, never at whether the city/ZIP actually matched.

Sending the same address as *structured* fields returns the correct result:

```text
address_line1=4 Yawkey Way & place=Boston & region=MA & postcode=02215
-> "4 Yawkey Way, Boston, Massachusetts 02115" @ 42.345899, -71.098794  (Fenway Park, confidence: high)
```

## Fix

### 1. Structured geocoding in the edge function (`supabase/functions/geocode-address/index.ts`)
- Parse each incoming address into `address_line1` (street), `place` (city), `region` (state), `postcode` (5-digit), dropping any leading business-name segment like `Fenway Park,` / `Set Epes Yard,`.
- When street + city + state are all present, call Mapbox with those structured params instead of `q`.
- Fall back to the current free-text `q` call only when the address can't be parsed.

### 2. Validate the match before trusting it
- Read `properties.match_code`. Reject a result as address-precision when `place` is `unmatched` **or** `confidence` is `low`.
- On rejection, retry once at city level (`q = "City, ST"`, `types=place`) and return that with `precision: 'city'` — a city centroid is wrong-by-a-few-miles, never wrong-by-a-different-island.
- Include the matched `full_address` in the response so the client can log/compare what was actually resolved.

### 3. Self-healing of already-stored bad coordinates
No data migration needed: `FleetMapView` already re-fetches a route whose stored endpoints drift more than half a mile from freshly geocoded coordinates. Once geocoding returns Boston, this load's Nantucket geometry is replaced automatically on next view. I'll confirm this by loading the dispatcher map after the fix.

### 4. Client parser cleanup (`src/lib/geocoding.ts`)
`parseAddressParts` already extracts street/city/state/postal but only for the Nominatim fallback. I'll reuse that same parsing on the Mapbox path (share it via the edge function payload) so both tiers agree on what the street and city are, and keep the existing cascade order otherwise unchanged.

## Verification
- Re-run the Mapbox call for this load through the deployed function and confirm `42.3459, -71.0988`.
- Spot-check the other stored addresses (FedEx Boston Harborside Dr, JFK BLDG 262, Winston Salem) for correct placement.
- Open the dispatcher map and confirm the route ends at Fenway Park rather than Nantucket.
