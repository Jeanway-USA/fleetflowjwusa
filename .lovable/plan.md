
## Extend soft-delete to finance & load/maintenance sub-records

Adds archiving with Undo toast + Archive page support to 10 more tables. Everything reuses the existing `archive_record` / `restore_record` RPCs and `archiveWithUndo` helper — no new infrastructure.

### Tables getting `deleted_at`

Finance & payroll (6):
- `settlements`
- `driver_settlements`
- `driver_payroll`
- `load_expenses`
- `agent_commissions`
- `safety_bonus_payouts`

Load & maintenance sub-records (4):
- `load_status_logs`
- `load_intermediate_stops`
- `load_accessorials`
- `maintenance_logs`

### 1. Migration

For each of the 10 tables:
- `ALTER TABLE public.<t> ADD COLUMN deleted_at timestamptz;`
- `CREATE INDEX IF NOT EXISTS <t>_active_idx ON public.<t> (org_id) WHERE deleted_at IS NULL;`

Update the two allow-list RPCs (`public.archive_record`, `public.restore_record`) to include the 10 new table names in their `CASE` branch — same pattern as the existing 18.

Update `public.has_archive_access(_table text)` to map each new table to a role list:
- Finance tables → `owner`, `payroll_admin`
- Load sub-records (`load_status_logs`, `load_intermediate_stops`, `load_accessorials`) → `owner`, `dispatcher`
- `maintenance_logs` → `owner`, `maintenance`, `dispatcher`

No schema changes to RLS beyond that — existing SELECT/UPDATE policies already scope by `org_id` and continue to apply.

### 2. Client wiring (`src/lib/soft-delete.ts`)

- Append the 10 tables to `ARCHIVABLE_TABLES`.
- Add entries to `TABLE_LABELS` (e.g. `settlements → Settlement / Settlements`, `load_status_logs → Status Log / Status Logs`, etc.).
- Add matching entries to `ARCHIVE_ROLE_MAP` mirroring the DB.

### 3. Query filters

Add `.is('deleted_at', null)` to the primary list queries for the six finance tables where a user-facing list exists:
- Settlements list (BCO + Independent settlement pages)
- Driver Settlements tab
- Driver Payroll list
- Load Expenses displayed on load detail (filter but keep aggregates as-is — this only hides archived rows)
- Agent Commissions report
- Safety Bonus Payouts list

Load sub-records (`load_status_logs`, `load_intermediate_stops`, `load_accessorials`) and `maintenance_logs` are surfaced inside parent-record detail views only. Filter their fetches too so archived rows disappear from the parent detail.

Any aggregate / analytics queries (P&L, True Net Income, IFTA, leaderboard) are **not** touched — they must still count historical rows. This matches how the existing 18 tables already behave.

### 4. Delete → Archive UI

Replace hard-`DELETE` mutations with `archiveWithUndo({ table, id, queryClient, invalidateKeys })` on the pages that expose delete actions for these entities:
- `src/pages/Settlements.tsx` (and Independent variant if separate)
- `src/pages/DriverPayroll.tsx` / Driver Settlements tab
- Any load-detail component that lets users delete expenses / accessorials / intermediate stops / status logs
- Maintenance log entry rows inside truck/trailer maintenance history

Bulk actions where they already exist get `archiveManyWithUndo`.

### 5. Archive page (`src/pages/Archive.tsx`)

Add a `VIEW_CONFIG` entry for each new table: columns to show, primary label field, and secondary metadata. Tabs render automatically from `accessibleTables`, so no route or layout changes.

### Out of scope
- Documents, communications, notifications tables (deferred per your last answer).
- No `is_archived` boolean — `deleted_at IS NULL` remains the single source of truth.
- No changes to analytics/reporting aggregates.
- No changes to cascade behavior — archiving a parent (e.g. a load) does not auto-archive its sub-records; that stays a separate discussion.

### Technical notes
- RPC allow-list is authoritative; client `ARCHIVE_ROLE_MAP` is only for UI gating.
- Partial indexes on `(org_id) WHERE deleted_at IS NULL` keep active-row lookups fast without bloating archived rows.
- Existing `archiveWithUndo` already handles the 10s Undo toast and query invalidation.
