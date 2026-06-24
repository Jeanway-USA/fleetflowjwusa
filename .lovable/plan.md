## Auto-harvest CRM contacts from Loads and Work Orders

Add automatic CRM contact creation whenever a new load (with an agent/agency) or maintenance work order (with a vendor/shop) is created. Implement via database triggers so the behavior is consistent across every code path (UI, imports, edge functions) and survives future refactors.

### Task 1 — Schema adaptation (`crm_contacts`)

The existing `crm_contacts` table already covers most requested fields. Minimal changes:

- Reuse `contact_type` for the type axis, expanding the allowed values to include `'shop'` (existing `'agent'` already represents freight agencies; we keep that value so existing rows aren't disturbed, but I'll accept `'agency'` writes by normalizing to `'agent'` in the trigger).
- Reuse `agent_code` as the unique agency code (`agency_code_or_id`).
- Reuse `company_name` for `name`, and existing `phone` / `email` / `address` / `city` / `state` columns for contact info (no JSONB needed — current shape is richer than a JSON blob and matches the rest of the app).
- `agent_status` already exists; the trigger will default it to `'safe'` for auto-imports. Backfill any NULLs to `'safe'`.
- Add a partial unique index so the same agency code or shop name isn't auto-inserted twice per org:
  - `unique (org_id, lower(agent_code))` where `contact_type = 'agent'` and `agent_code is not null`
  - `unique (org_id, lower(company_name))` where `contact_type = 'shop'`

### Task 2 — Load intercept (DB trigger)

`AFTER INSERT` trigger on both `fleet_loads` and `agency_loads`:

1. Resolve an "agency code" from the new row in priority order:
   - `fleet_loads.landstar_load_id` prefix (the Landstar agency code) **or** `broker_name`
   - `agency_loads.broker_name` (no agent_code column on this table)
2. If a usable identifier exists and no `crm_contacts` row matches in the same `org_id` (case-insensitive match on `agent_code`, falling back to `company_name`), insert:
   ```
   contact_type = 'agent', agent_status = 'safe', is_active = true,
   org_id = NEW.org_id, agent_code = <code>, company_name = <broker_name or code>,
   notes = 'Auto-added from load <load_id>'
   ```
3. Trigger is `SECURITY DEFINER` with locked `search_path`, ignores conflicts via `ON CONFLICT DO NOTHING`, and never fails the parent insert (wrapped in `BEGIN/EXCEPTION WHEN OTHERS THEN NULL`).

### Task 3 — Maintenance intercept (DB trigger)

`AFTER INSERT` trigger on `work_orders`:

1. Read `NEW.vendor` (the shop name on the work order).
2. If non-empty and no `crm_contacts` row with `contact_type IN ('shop','vendor')` matches `company_name` for the same `org_id`, insert:
   ```
   contact_type = 'shop', agent_status = 'safe', is_active = true,
   org_id = NEW.org_id, company_name = NEW.vendor,
   notes = 'Auto-added from work order <wo_id>'
   ```
3. Same safety wrapping as the load trigger.

No client code changes are needed for Tasks 2 and 3 — every existing and future insert path benefits automatically.

### Task 4 — UI: Freight Agencies vs Maintenance Shops

`src/pages/CRM.tsx` (the `AgentCRM` view):

- Add a prominent top-level toggle (segmented `Tabs`) **above** the existing type-filter tabs:
  - `Freight Agencies` — filters to `contact_type IN ('agent','broker')`
  - `Maintenance Shops` — filters to `contact_type = 'shop'` plus `company_resources.resource_type = 'mechanic'` (existing mechanic vendors stay visible)
- The existing inner type tabs (`All / Brokers / Agents / Shippers / Receivers / Vendors`) are scoped to whichever top-level segment is active, and hidden on the Shops view (a simpler sub-filter for shops isn't needed yet).
- `useUnifiedContacts` gets a `scope: 'agencies' | 'shops'` argument that narrows the queried `contact_type`/`resource_type` values.
- Add a "Auto-added" badge next to rows where `agent_status = 'safe'` and `notes` starts with `Auto-added from`, so users can quickly see auto-harvested contacts and promote/edit them.

### Technical notes

- Triggers run as `SECURITY DEFINER` and write `org_id` from `NEW.org_id`, so RLS on `crm_contacts` is satisfied without changing existing policies.
- No new edge functions, no client-side intercept code — keeps the rule single-sourced in the database.
- Migration order: (1) add `'shop'` to allowed `contact_type` values / drop+recreate any CHECK constraint, (2) backfill `agent_status`, (3) add partial unique indexes with `ON CONFLICT` safety, (4) create the two trigger functions + triggers.

### Out of scope

- No JSONB `contact_info` column — current normalized columns already cover phone/email/location and are used everywhere in the app.
- No changes to `agency_loads.broker_name` semantics or to Smart Load Creator extraction logic.
- No automatic deletion of auto-harvested contacts when a load/WO is deleted (they remain as CRM entries the user can manage).