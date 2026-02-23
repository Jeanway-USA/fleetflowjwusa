

## Add KNOWN_STOPS for Major US Logistics Corridors

Currently the `KNOWN_STOPS` array has ~65 entries. Many high-traffic trucking corridors have zero or minimal coverage. This update adds ~80 new stops across all major freight corridors to dramatically improve real-stop matching before the interpolated fallback kicks in.

### New Corridor Coverage

| Corridor | Route | Stops Added |
|----------|-------|-------------|
| I-5 (West Coast) | Seattle - Sacramento - LA - San Diego | 8 |
| I-10 (Southern) | Jacksonville - Mobile - Beaumont - Tucson | 6 |
| I-15 (Mountain West) | San Diego - Las Vegas - SLC - Idaho Falls | 5 |
| I-20 (Deep South) | Atlanta - Jackson MS - Midland TX | 4 |
| I-24 / I-59 (Southeast) | Chattanooga - Nashville connector, Meridian MS | 3 |
| I-30 (TX-AR) | Dallas - Texarkana - Little Rock | 3 |
| I-35 (Central) | Laredo - San Antonio - Waco - Wichita - KC | 5 |
| I-40 (Cross-Country) | Barstow CA - Flagstaff - Amarillo - Little Rock - Wilmington NC | 7 |
| I-44 (OK-MO) | Tulsa - Joplin - Springfield MO | 3 |
| I-55 (Mississippi Valley) | New Orleans - Jackson MS - Memphis - Springfield IL - Chicago | 4 |
| I-64 (Mid-Atlantic) | Norfolk - Richmond - Charleston WV - Lexington KY | 4 |
| I-65 (North-South Central) | Mobile - Montgomery - Bowling Green - Indianapolis | 4 |
| I-70 (East-West Central) | Indianapolis - Columbus - Wheeling - Hagerstown | 4 |
| I-71 (OH-KY) | Cincinnati - Columbus - Cleveland | 3 |
| I-74 / I-57 (Midwest) | Champaign IL - Bloomington - Peoria | 3 |
| I-75 (Great Lakes to FL) | Tampa - Ocala - Macon - Chattanooga - Lexington - Toledo | 6 |
| I-76 / PA Turnpike | Philadelphia - Harrisburg - Pittsburgh connector | 2 |
| I-80 (Northern) | Reno - Cheyenne - Des Moines - Toledo - Youngstown | 5 |
| I-85 (Piedmont) | Atlanta - Greenville SC - Durham NC - Petersburg VA | 4 |
| I-90 (Northern Tier) | Spokane - Billings - Sioux Falls - Madison - Erie | 5 |

**Total: ~88 new entries**, bringing coverage from ~65 to ~153 stops.

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/landstar-fuel-stops/index.ts` | Add ~88 new entries to the `KNOWN_STOPS` array, organized by corridor with comments |

### Technical Notes

- Each entry follows the existing format: `{ name, chain, lat, lng, state, city }`
- Chains are distributed across Pilot/Flying J, Love's, TA/Petro, Sapp Bros, Casey's, and Buc-ee's based on real-world presence in each region
- Coordinates are placed at actual city centers (close to real truck stop clusters near interstate exits)
- No frontend changes needed -- the existing corridor filter and density fallback will automatically pick up the new stops
- The edge function will need redeployment after the update

