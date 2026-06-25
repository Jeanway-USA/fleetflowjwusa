## Goal
Backfill `load_intermediate_stops` rows for existing loads that already have stops embedded in their `notes` field, so drivers can confirm each stop and log Remaining HOS like they can on new multi-stop loads.

## Findings
- 62 total loads in `fleet_loads`.
- 17 loads contain an `=== INTERMEDIATE STOPS ===` block in `notes`.
- 0 of them have matching rows in `load_intermediate_stops` — every existing multi-stop load is unprepared.
- Existing format is consistent with `src/lib/parseIntermediateStops.ts`, e.g.:
  `Stop 2 (Drop): Facility, Facility, 8030 Park Ln, DALLAS, TX 75231 - 2026-06-19`

## Plan
One-time data migration (via the insert tool, no schema change) that:

1. Iterates over each `fleet_loads` row whose `notes` contains an `=== INTERMEDIATE STOPS ===` block and has no rows in `load_intermediate_stops` yet.
2. For every `Stop N (Type): …` line, extracts:
   - `stop_number` (integer)
   - `stop_type` (`Pickup` / `Drop`)
   - `facility_name` (first comma segment)
   - `location` (segments from index 2 onward — same de-duplication the TS parser does)
   - `scheduled_date` (trailing `YYYY-MM-DD`, nullable)
3. Inserts a row into `load_intermediate_stops` with:
   - `load_id`, `org_id` (copied from the parent load)
   - `status = 'pending'`
   - `remaining_hos = NULL`, `completed_at = NULL`
4. Runs in a single transaction, idempotent (skips loads that already have stops), so it's safe to re-run.

No UI, schema, RLS, or business-logic changes — `ConfirmStopDialog`, `IntermediateStopsView`, and the dispatcher/fleet surfaces already read from `load_intermediate_stops` and will light up automatically once the rows exist.

## Technical detail
SQL outline:

```sql
WITH parsed AS (
  SELECT
    fl.id        AS load_id,
    fl.org_id,
    m[1]::int    AS stop_number,
    m[2]         AS stop_type,
    m[3]         AS body
  FROM fleet_loads fl,
       regexp_matches(
         split_part(fl.notes, '--- Updated from Rate Confirmation ---', 1),
         '^Stop\s+(\d+)\s+\((\w+)\):\s*(.+)$',
         'gm'
       ) AS m
  WHERE fl.notes ILIKE '%=== INTERMEDIATE STOPS ===%'
    AND NOT EXISTS (
      SELECT 1 FROM load_intermediate_stops s WHERE s.load_id = fl.id
    )
)
INSERT INTO load_intermediate_stops
  (load_id, org_id, stop_number, stop_type, facility_name, location, scheduled_date, status)
SELECT
  load_id,
  org_id,
  stop_number,
  stop_type,
  -- facility_name = first comma segment of body (after stripping trailing date)
  -- location      = segments[2..] joined, matching parseIntermediateStops.ts
  -- scheduled_date= trailing YYYY-MM-DD if present
  ...,
  'pending'
FROM parsed;
```

After running I'll re-check with a count query to confirm all 17 loads now have rows, and report the totals back.
