

## Plan: Repurpose Infrastructure Tab as Platform Health Dashboard

### Overview
Replace the broken storage-bucket table with a useful cross-tenant infrastructure overview showing: per-org storage provider adoption, document counts by organization, database record counts across key tables, and edge function configuration status.

### Database Migration
Create a new security-definer view `super_admin_infrastructure_stats` that aggregates:
- **Storage providers**: Join `organizations` with `org_storage_config` to show each org's provider type (built-in vs Google Drive) and connection status
- **Document counts**: Count documents per org from the `documents` table
- **Platform totals**: Total rows across key tables (fleet_loads, trucks, drivers, expenses, documents)

```sql
CREATE OR REPLACE VIEW public.super_admin_infrastructure_stats
WITH (security_invoker = false) AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.is_active,
  COALESCE(sc.provider, 'built_in') AS storage_provider,
  COALESCE(sc.is_active, false) AS storage_connected,
  sc.connected_at AS storage_connected_at,
  (SELECT count(*) FROM documents d WHERE d.org_id = o.id)::integer AS document_count,
  (SELECT count(*) FROM fleet_loads fl WHERE fl.org_id = o.id)::integer AS load_count,
  (SELECT count(*) FROM trucks t WHERE t.org_id = o.id)::integer AS truck_count,
  (SELECT count(*) FROM drivers dr WHERE dr.org_id = o.id)::integer AS driver_count
FROM organizations o
LEFT JOIN org_storage_config sc ON sc.org_id = o.id
WHERE is_super_admin();
```

Grant SELECT to authenticated, revoke from anon/public.

### Component Rewrite: `src/components/superadmin/InfrastructureTab.tsx`
Replace entirely with three cards:

1. **Platform Totals** — KPI row showing total documents, loads, trucks, drivers across all orgs
2. **Storage Provider Adoption** — Summary badges showing how many orgs use Google Drive vs built-in, plus a pie chart
3. **Per-Org Breakdown** — Table with columns: Org Name, Storage Provider, Connected Date, Documents, Loads, Trucks, Drivers — sortable, showing active orgs first

### Files
| File | Action |
|------|--------|
| Migration SQL | Create `super_admin_infrastructure_stats` view |
| `src/components/superadmin/InfrastructureTab.tsx` | Rewrite — platform health dashboard |

