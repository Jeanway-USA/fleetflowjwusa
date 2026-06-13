---
name: Appointment time standardization
description: UTC timestamptz + per-stop IANA tz storage, Company/Local display toggle, dual-write contract
type: feature
---
**Storage contract (live since 2026-06-13 migration):**
- `fleet_loads` / `agency_loads` now carry `pickup_at` + `pickup_tz` and `delivery_at` + `delivery_tz`.
  - `*_at` are true UTC `timestamptz`. `*_tz` are IANA strings (e.g. `America/Chicago`).
- Legacy `pickup_date`/`pickup_time`/`delivery_date`/`delivery_time` are still written for one release (deprecation window). Drop in a follow-up migration after the next stable release.
- `organizations.company_timezone` (default `America/Chicago`) holds the org-wide "Company Time" reference.
- `profiles.time_display_pref` is `'company' | 'local'` (default `'company'`).

**Form contract:** every load creation/edit form MUST send both legacy fields AND `pickup_at`/`pickup_tz`/`delivery_at`/`delivery_tz`. Use `combineToUtc(date, time, tz)` from `src/lib/datetime.ts`. Auto-default the per-stop tz from the typed origin/destination state via `guessTimezoneFromLocation()`, then fall back to `companyTz`. Once the user picks a TZ explicitly, stop re-guessing.

**Display contract:** never read `pickup_time`/`delivery_time` strings in new code. Use `<StopTime utcIso={load.pickup_at} tz={load.pickup_tz} />` (or `formatStopTime` directly). The viewer's effective zone comes from `useTimeDisplay().viewerTz` (Company/Local toggle, mounted in `DashboardLayout` header). Each stop always renders in its OWN zone with an abbreviation (`08:00 CST`); a secondary `(06:00 PDT) your time` line auto-appears when the viewer's effective zone differs.

**Backfill:** historical rows were backfilled by mapping the last comma token of origin/destination → IANA zone (`public.state_to_iana(text)`), with `public.parse_legacy_time(text)` tolerating `"15:50 PM"`-style junk. Anything unparseable falls back to the org's `company_timezone` / `00:00`.

**Library:** `date-fns-tz` v3 (uses `fromZonedTime`, not the v2 `zonedTimeToUtc`). Abbreviations come from `Intl.DateTimeFormat` so DST handling is automatic.
