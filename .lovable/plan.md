## Backfill CRM from existing loads and work orders

Run a one-time data backfill mirroring the auto-harvest triggers, so every historical load/work order contributes a CRM contact (idempotent — skips any agency or shop already in the CRM for that org).

### Steps

1. **Agencies from `fleet_loads`** — for each row with a non-empty `landstar_load_id` or `broker_name`, insert one `crm_contacts` row with `contact_type='agent'`, `agent_status='safe'`, `is_active=true`, `agent_code = landstar_load_id`, `company_name = broker_name` (or the code), `notes = 'Auto-added from load <load_id>'`. Skip when the org already has a contact with the same `agent_code` or `company_name` (case-insensitive). Group by `(org_id, lower(agent_code), lower(company_name))` so duplicates inside the load history collapse to one insert.

2. **Agencies from `agency_loads`** — same shape, using `broker_name` only (this table has no agency code). Insert `contact_type='agent'`, dedup by `(org_id, lower(broker_name))`, skip if already in CRM.

3. **Shops from `work_orders`** — for each row with a non-empty `vendor`, insert `contact_type='shop'`, `agent_status='safe'`, `company_name = vendor`, `notes = 'Auto-added from work order <wo_id>'`. Dedup by `(org_id, lower(vendor))`, skip if an existing CRM row with `contact_type IN ('shop','vendor')` already matches.

All three inserts use `ON CONFLICT DO NOTHING` against the partial unique indexes created in the previous migration, and an explicit `NOT EXISTS` filter against `crm_contacts` so previously-curated entries are left untouched.

### Out of scope

- No schema changes (the columns and indexes are already in place).
- No UI changes — the existing CRM page already shows the new entries under **Freight Agencies** and **Maintenance Shops** with the "Auto-added" badge.