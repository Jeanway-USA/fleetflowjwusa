## Expand audit triggers to cover more tables

Attach `log_audit_event()` to the remaining high-value tables so every meaningful change is captured. Super-admin actions remain excluded automatically.

### Tables to add

**Financial**
- `expenses`
- `load_expenses`
- `fuel_purchases`
- `settlements`
- `driver_settlement_items`
- `agent_commissions`
- `truck_loan_payments`

**People & access**
- `drivers`
- `user_roles`
- `invitations`
- `driver_banking_info`

**Fleet & equipment**
- `trailers`
- `trailer_assignments`

**Maintenance**
- `work_orders`
- `maintenance_requests`
- `service_schedules`
- `parts_inventory`

**Loads & operations**
- `load_intermediate_stops`
- `load_accessorials`
- `detention_requests`
- `driver_requests`
- `documents`

**Safety**
- `incidents`
- `incident_witnesses`

**Config**
- `company_settings`
- `org_storage_config`
- `document_templates`

### Not included (intentional)

- `audit_logs` — never audit the audit log.
- `driver_locations`, `driver_notifications`, `driver_performance_metrics`, `pm_notifications`, `messages`, `maintenance_request_messages`, `load_status_logs`, `general_ledger`, `crm_activities`, `crm_contact_loads`, `ifta_records`, `driver_signed_documents`, `tax_documents` — high-frequency telemetry/derived data or already logged elsewhere; would flood the trail.
- `organizations` — writes only via super-admin RPCs (already filtered) or `prevent_org_billing_self_update` trigger.

### Implementation

Single migration that does, for each table above:

```sql
DROP TRIGGER IF EXISTS audit_<t> ON public.<t>;
CREATE TRIGGER audit_<t>
  AFTER INSERT OR UPDATE OR DELETE ON public.<t>
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
```

No code changes. Function, RLS, and UI are unchanged.

### Files

- 1 new migration: `supabase/migrations/<ts>_audit_triggers_expand.sql`

Say the word and I'll ship it. If any table above should be excluded (or one I skipped should be added), tell me and I'll adjust before running.