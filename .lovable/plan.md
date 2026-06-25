## Three fixes

### 1. Detail sheet pops up when clicking Edit in row dropdown

Root cause: in `src/pages/CRM.tsx` the table row has `onRowClick={(c) => setDetailContact(c)}`. The `DropdownMenuTrigger` button stops propagation, but `DropdownMenuItem` clicks (Edit / Delete / View) do not — so clicking "Edit" in the menu bubbles up to the row, which opens the detail sheet. `handleEdit` then sets `detailContact` back to `null`, but in the meantime Radix mounts the Sheet and steals focus.

**Fix:** add `onClick={(e) => e.stopPropagation()}` (or `onSelect={(e) => e.preventDefault()}` + manual stop) on each `DropdownMenuItem` inside the actions column, and on the `DropdownMenuContent` itself as a safety net. Result: row click handler never fires when interacting with the menu, so the detail sheet stops appearing during Edit/Delete.

### 2. Auto-added agents land in the wrong table and can duplicate

Auto-harvest trigger `public.autoharvest_crm_agent_from_load` (migration `20260624030643…`) inserts into `crm_contacts` with `contact_type='agent'`. But the real "Load Agent" record lives in `company_resources` with `resource_type='load_agent'` — that's what the Agents tab, edit form, and detail sheet treat as a true Load Agent. The trigger's existence check also only looks at `crm_contacts`, so a load can re-create an agent even when a `company_resources` entry already exists. End result: duplicates and "half-agents" that miss fields.

**Fix (new migration):** rewrite `autoharvest_crm_agent_from_load` so that:

- It inserts into `public.company_resources` instead of `crm_contacts`, with:
  - `resource_type = 'load_agent'`
  - `name = COALESCE(v_name, v_code)` (Agency Name)
  - `agent_code = v_code`
  - `agent_status = 'safe'`
  - `notes = 'Auto-added from load ' || v_load_id`
  - `org_id = NEW.org_id`
- Duplicate guard checks BOTH tables before inserting:
  - skip if any `company_resources` row in this org has `resource_type='load_agent'` AND (`lower(agent_code)=lower(v_code)` OR `lower(name)=lower(v_name)`)
  - skip if any `crm_contacts` row in this org has `contact_type IN ('agent','broker')` AND matches by `agent_code` or `company_name` (covers legacy auto-added rows so we don't double-create)
- Keep `ON CONFLICT DO NOTHING` and the existing `EXCEPTION WHEN OTHERS THEN NULL` swallow so loads never fail because of CRM harvesting.

One-time data cleanup in the same migration:

- For each legacy `crm_contacts` row where `contact_type='agent'` AND `notes LIKE 'Auto-added from load %'`:
  - If no matching `company_resources` Load Agent exists in that org (by agent_code or name), move it: insert into `company_resources` with the values above.
  - Then delete the legacy `crm_contacts` row (regardless of whether it was moved or skipped as duplicate).
- De-dupe existing `company_resources` Load Agents per org: keep the oldest row per (org_id, lower(agent_code)) and per (org_id, lower(name)) where agent_code is null; delete the rest. Only delete rows that have no dependents (no `crm_contact_loads`/no FK references) — if a candidate dup has dependents, keep it and just log nothing (silent).

### 3. Agents table still shows irrelevant columns

`ContactFormDialog` Agent form only collects: Agent Code, Agent Status, Agency Name (`company_name`), Phone, Email, Website, Notes. My previous column set still included an "Agency" column mapped to `contact_name` (always blank for resources) and a "Service Area" column (only used for roadside vendors).

**Fix:** in `src/pages/CRM.tsx` `getColumnsFor('agent', …)`, replace columns with exactly:

`Agency Name (company_name) | Agent Code | Status | Phone | Email | Website | Actions`

- Drop the bogus "Agency" (contact_name) column.
- Drop "Service Area" — agents don't have one.
- Make Agent Code render via the existing `renderCode` helper (mono chip).
- Status uses `renderAgentStatus` (Safe / Unsafe / Unrated).
- Website renders as a truncated link when present, `—` otherwise.

No other tab's columns change.

## Technical notes

- Files touched in this change: `src/pages/CRM.tsx` (column set + dropdown stopPropagation) and one new SQL migration for the trigger rewrite + cleanup.
- No changes to `ContactFormDialog`, `ContactDetailSheet`, `useCRMData`, or schemas — only the trigger function body and a one-shot data backfill.
- Migration is idempotent: `CREATE OR REPLACE FUNCTION` for the trigger; cleanup uses `WHERE NOT EXISTS` guards so re-running is safe.
- No new GRANTs needed (function is SECURITY DEFINER; `company_resources` already has policies).
