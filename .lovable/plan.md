# Standardize Appointment Times: True UTC + Per-Stop Timezone + Display Toggle

## Decisions (locked in)
- **Storage**: true `timestamptz` for each appointment + an IANA timezone column per stop (`America/Chicago` etc.).
- **Display**: always render the abbreviation next to the time (`08:00 CST`) **and** add a header toggle for `Company Time` ↔ `Local Time` that flips every screen.
- **Backfill**: geocode existing rows' origin/destination → IANA zone.

## Current state (from audit)
- `fleet_loads` and `agency_loads` store `pickup_date date`, `delivery_date date`, plus `pickup_time text`, `delivery_time text`. No timezone anywhere.
- ~49 historical `fleet_loads` rows + agency rows to backfill.
- No org-level or user-level timezone preference exists yet.
- Affected UI: `IndependentLoadBuilder`, `SmartLoadCreator`, `RateConfirmationUpload`, `FleetLoads` page, `ActiveLoadsBoard`, `UpcomingPickups`, `FleetTimelineScheduler`, `RapidCallModal`, `DriverLoadsView`, `ActiveLoadCard`, `NextLoadPreview`, `DriverDashboard`, `DriverSpectatorView`, `PublicLoadTracker`, `AgencyLoads`, `DispatcherDashboard`.

## Schema migration (single migration call)

```text
fleet_loads / agency_loads
  + pickup_at         timestamptz
  + pickup_tz         text          -- IANA, e.g. 'America/Chicago'
  + delivery_at       timestamptz
  + delivery_tz       text
  ( pickup_date / pickup_time / delivery_date / delivery_time kept for now —
    dropped in a follow-up after one stable release )

organizations
  + company_timezone  text          NOT NULL DEFAULT 'America/Chicago'

profiles
  + time_display_pref text          NOT NULL DEFAULT 'company'
                                    CHECK in ('company','local')
```

No new tables, so no GRANT block needed; existing privileges carry over for ALTER TABLE.

## Backfill strategy (data migration)

Pragmatic, no external API: map US `state` (parsed from `origin` / `destination` text, e.g. `"Dallas, TX"` → `TX`) to its dominant IANA zone via a static lookup table embedded in the migration's PL/pgSQL function. The Tier-2 dual-zone states (TX, FL, ID, IN, KY, TN, ND, SD, NE, KS, OR, MI) default to their majority zone with a code-side note. Then:

```text
UPDATE fleet_loads
  SET pickup_tz   = state_to_iana(origin),
      delivery_tz = state_to_iana(destination),
      pickup_at   = (pickup_date::text   || ' ' || COALESCE(pickup_time,'00:00'))::timestamp
                      AT TIME ZONE state_to_iana(origin),
      delivery_at = (delivery_date::text || ' ' || COALESCE(delivery_time,'00:00'))::timestamp
                      AT TIME ZONE state_to_iana(destination)
  WHERE pickup_date IS NOT NULL;
```

Same pattern for `agency_loads`. Rows whose origin/destination can't be parsed fall back to the org's `company_timezone`.

## Shared client utility — `src/lib/datetime.ts`

```text
combineToUtc(dateStr, timeStr, ianaTz): string   // 'YYYY-MM-DD','HH:mm','America/Chicago' -> ISO UTC
splitFromUtc(utcIso, ianaTz): { date, time }     // for editing
formatStopTime(utcIso, stopTz, opts): {
  primary: '08:00 CST',
  secondary?: '06:00 PST'   // present when viewer's effective zone differs
}
useTimeDisplay(): {
  mode: 'company' | 'local',
  effectiveTz: string,        // companyTz when mode==='company', else browser zone
  setMode: (m) => void
}
```

Implemented with `Intl.DateTimeFormat` (`timeZoneName: 'short'`) — no new dependency. State/IANA map shared with the backfill.

## UI changes

### Header toggle
Add a small pill toggle in `src/components/layouts/DashboardLayout.tsx` header (next to user menu): `Company Time | Local Time`. Persists to `profiles.time_display_pref` via a new context `TimeDisplayProvider` mounted inside `ProtectedRoute`.

### Load creation forms
`IndependentLoadBuilder`, `SmartLoadCreator` (manual edit step), `RateConfirmationUpload` (confirm step), and the FleetLoads inline form:
- Add a `Timezone` dropdown next to each date/time field, auto-defaulted from the parsed state of the origin/destination (or org's `company_timezone` if unknown). Common US zones listed first, then full IANA list.
- On save, send `pickup_at`/`delivery_at` (UTC ISO) and `pickup_tz`/`delivery_tz` instead of the legacy split fields. Legacy fields are also written (for the deprecation window) by deriving them back from the UTC + tz so any code still reading them works.

### Display components
Every place that currently renders `pickup_date` / `pickup_time` (and delivery) is replaced with `formatStopTime(load.pickup_at, load.pickup_tz)`. Output renders as:

```text
Mon, Jun 15 · 08:00 CST       (when mode === 'local' and viewer is in CST,
                               OR mode === 'company' and company is CST)

Mon, Jun 15 · 08:00 CST       (when mode === 'company', differing stop zone)
              (06:00 your time)

Mon, Jun 15 · 08:00 CST       (when mode === 'local', viewer in PST)
              (10:00 PST)
```

Files updated: `ActiveLoadsBoard`, `ActiveLoadCard`, `UpcomingPickups`, `FleetTimelineScheduler`, `NextLoadPreview`, `DriverLoadsView`, `RapidCallModal`, `PublicLoadTracker`, `AgencyLoads`, `FleetLoads`, `DispatcherDashboard`, `DriverDashboard`, `DriverSpectatorView`.

### Settings
Add `Company Timezone` selector to the existing org settings → Company tab. Defaults to `America/Chicago`. Owners only.

## Detail-level technical notes

- All `combineToUtc` calls use `date-fns-tz`'s `zonedTimeToUtc` (already common in the React ecosystem; add the single dep `date-fns-tz`).
- `formatStopTime` calls `Intl.DateTimeFormat(undefined, { timeZone: stopTz, hour:'2-digit', minute:'2-digit', timeZoneName:'short' })` — abbreviations come from the runtime so they're always correct for the date (handles DST transitions automatically).
- The header toggle's selected mode is also persisted in `localStorage` (`time-display-mode`) so the first paint after reload is correct before the profile fetch resolves.
- The Core memory rule `Append 'T00:00:00' to 'YYYY-MM-DD' before parsing to prevent timezone shifting` still applies for pure date fields (delivery date with no time); the new util respects it.
- Edge functions that send broker status emails (`email-load-status`) currently include `pickup_date`/`pickup_time` strings — switched to formatted `pickup_at + pickup_tz` so brokers see `"08:00 CST"` consistently.

## Validation

- Create a new load in IndependentLoadBuilder with pickup `Dallas, TX 08:00` and delivery `Los Angeles, CA 14:00`. Confirm DB row stores `pickup_at = 2026-06-15T13:00:00Z` and `pickup_tz = 'America/Chicago'`; delivery `21:00Z` / `America/Los_Angeles`.
- View it as a Central-time dispatcher with toggle = Company: `08:00 CST` / `14:00 PDT (16:00 your time)`.
- Switch toggle → Local: `08:00 CST (06:00 your time)` / `14:00 PDT`.
- Open as a PST driver: pickup shows `08:00 CST (06:00 PDT)`.
- Refresh the page during a DST transition window (March test): confirm abbreviation flips `CST` ↔ `CDT` automatically.
- Backfilled historical loads display with their original wall-clock unchanged and a TZ label.

## Out of scope

- Mid-stop timezone changes (a load that crosses an additional waypoint with a different zone is still represented by just pickup_tz + delivery_tz).
- Per-driver default timezone (drivers inherit the viewer rule above).
- Dropping the legacy `pickup_date`/`pickup_time` columns — left for a follow-up cleanup migration after one release of dual-writing.
