

## Morning Briefing Widget

### New Component: `src/components/executive/MorningBriefingWidget.tsx`

A horizontal row of clickable metric badges rendered above the CriticalAlertsBar. Each badge runs a quick count query and only renders if count > 0. Clicking navigates to the relevant page.

**Four metrics:**
1. **Loads Picking Up Today** — query `fleet_loads` where `pickup_date = today` and status in (`assigned`, `booked`) → navigates to `/loads?status=assigned`
2. **Drivers Expiring < 30 Days** — query `drivers` where `license_expiry`, `medical_card_expiry`, or `mvr_expiry` is within 30 days → navigates to `/safety`
3. **Trucks Past PM Schedule** — reuse `getTruckHealthStatus` from `usePMHealthCalculations.ts`, count trucks with `overdue` status → navigates to `/maintenance`
4. **Delivered Loads Missing PODs** — query `fleet_loads` where `status = 'delivered'` and `pod_url IS NULL` → navigates to `/loads?status=delivered`

Each badge: colored pill with icon + count + label, using `useNavigate` on click. Uses a single `useQuery` that runs all four counts in parallel via `Promise.all`.

### Edit: `src/pages/ExecutiveDashboard.tsx`
- Import `MorningBriefingWidget`
- Render it between the header and `CriticalAlertsBar` (line ~703)

### Files
| File | Action |
|------|--------|
| `src/components/executive/MorningBriefingWidget.tsx` | Create |
| `src/pages/ExecutiveDashboard.tsx` | Add import + render |

### No database changes needed

