
## Automated Status Update Emails Feature

### Overview
Add `auto_email_updates` boolean to `fleet_loads`, expose it in the UI with a toggle, then create an edge function (`email-load-status`) triggered by the existing `trigger_log_load_status_change` database trigger.

---

### 1. Database Migration

```sql
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS auto_email_updates boolean NOT NULL DEFAULT true;
```

No new trigger needed — the existing `trigger_log_load_status_change` already fires on every `fleet_loads` status update and writes to `load_status_logs`. The edge function will be invoked via a **Supabase Database Webhook** watching `load_status_logs` inserts.

---

### 2. UI Changes — `src/pages/FleetLoads.tsx`

In the **Load Details** tab (after the status select), add a row with a Switch + label:

```
[ Auto Email Updates ]  [ Toggle Switch ]
```
- Default `true` for new loads (`formData.auto_email_updates ?? true`)
- Persisted in `formData.auto_email_updates`
- Import `Switch` from `@/components/ui/switch`
- Import `Mail` from `lucide-react`

---

### 3. Edge Function — `supabase/functions/email-load-status/index.ts`

**Trigger**: Database webhook on `INSERT` into `load_status_logs` → calls this function with the new row as JSON payload.

**Function logic**:
1. Parse the webhook payload → get `load_id`, `new_status`
2. Fetch load from `fleet_loads` (select `id`, `landstar_load_id`, `tracking_id`, `origin`, `destination`, `driver_id`, `org_id`, `agency_code`, `auto_email_updates`)
3. If `auto_email_updates` is false → return 200 immediately (no-op)
4. Fetch agent email by matching `agency_code` → `company_resources.agent_code` (type = `load_agent`) for the org. Also check `crm_contacts` by `agent_code`.
5. If no email found → return 200 (no-op, agent not in CRM)
6. Fetch driver location from `driver_locations` (lat/lng, optional)
7. Build tracking URL: `https://fleetflowjwusa.lovable.app/track?tracking_id={tracking_id}`
8. Send HTML email via Resend (reuse `RESEND_API_KEY` secret already configured)

**Email HTML**: Clean, branded, professional. Sections:
- Header with gold gradient (same as invite-user template style)
- "Load #[landstar_load_id or id]" status update
- Route: Origin → Destination
- Current Status badge
- Driver Location (if sharing)
- Tracking Link button
- Footer

**config.toml entry**:
```toml
[functions.email-load-status]
verify_jwt = false
```

---

### Agent Email Lookup Logic

The `agency_code` (3-char, e.g. `JNS`) on a load maps to `company_resources.agent_code`. The function checks:
1. `company_resources` where `agent_code = load.agency_code AND org_id = load.org_id` → use `.email`
2. Fallback: `crm_contacts` where `agent_code = load.agency_code AND org_id = load.org_id` → use `.email`
3. If both null → skip sending

---

### Files

| File | Action |
|------|--------|
| DB migration | Add `auto_email_updates boolean DEFAULT true` to `fleet_loads` |
| `src/pages/FleetLoads.tsx` | Add Switch toggle in Load Details tab + include in form payload |
| `supabase/functions/email-load-status/index.ts` | New edge function |
| `supabase/config.toml` | Add `[functions.email-load-status]` entry |

### Webhook Setup Note
After deploying the edge function, the user needs to create a **Database Webhook** in the Lovable Cloud backend:
- Table: `load_status_logs`, Event: `INSERT`
- Webhook URL: `https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/email-load-status`

This will be noted in the implementation with clear instructions.
