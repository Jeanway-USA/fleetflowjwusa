
## Audit Log Detail Sheet for System Health Tab

### Overview
Add a clickable detail sheet to the System Health tab's audit log rows, similar to how the Organizations tab opens an `OrgDetailSheet` when clicking a row. Clicking an audit log entry will open a slide-out sheet with enriched information about the event.

### 1. Update Database View

Update `super_admin_audit_logs` to join with `organizations` to include the org name, so we can show which organization each log belongs to.

**Migration SQL:**
```sql
CREATE OR REPLACE VIEW public.super_admin_audit_logs
WITH (security_invoker = false)
AS
SELECT
  a.id, a.user_id, a.action, a.table_name, a.record_id,
  a.details, a.created_at, a.org_id,
  o.name AS org_name
FROM public.audit_logs a
LEFT JOIN public.organizations o ON o.id = a.org_id
WHERE public.is_super_admin()
ORDER BY a.created_at DESC
LIMIT 50;
```

### 2. Create AuditLogDetailSheet Component

**New file: `src/components/superadmin/AuditLogDetailSheet.tsx`**

A slide-out Sheet (same pattern as `OrgDetailSheet`) that displays:

- **Timestamp** -- full date/time format
- **Organization** -- org name (with fallback to org_id if name unavailable)
- **User ID** -- full UUID (not truncated)
- **Action** -- INSERT/UPDATE/DELETE with color-coded badge
- **Table** -- which database table was affected
- **Record ID** -- the specific record that was modified
- **Details** -- formatted JSON view of the details object (pretty-printed, not truncated)
- **Contextual Analysis** section:
  - For DELETE actions on sensitive tables (drivers, settlements, payroll): show a warning indicator
  - For bulk operations (multiple logs from same user in short timeframe): note potential batch operation
  - Table-specific context: brief description of what the table contains (e.g., "settlements" = "Driver payment settlements")

### 3. Update SuperAdminDashboard

- Add state for `selectedLog` and `logSheetOpen` (same pattern as org detail)
- Make audit log table rows clickable with `cursor-pointer` and `hover:bg-muted/30`
- Add the "Organization" column to the table (using `org_name` from the updated view)
- Render `AuditLogDetailSheet` at the bottom of the page alongside `OrgDetailSheet`

### 4. Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/...` | Update `super_admin_audit_logs` view to join org name |
| `src/components/superadmin/AuditLogDetailSheet.tsx` | New -- audit log detail slide-out |
| `src/pages/SuperAdminDashboard.tsx` | Add log click handler, org_name column, render sheet |

### Technical Details

**AuditLogDetailSheet layout:**
- SheetHeader with action badge + table name as title
- Description: "Audit log entry details"
- Body sections separated by `<Separator />`:
  1. Metadata rows (timestamp, org, user, record ID) -- same flex layout as OrgDetailSheet
  2. Action badge with contextual severity (DELETE = destructive, INSERT = default, UPDATE = secondary)
  3. Pretty-printed JSON details in a code block with `bg-muted` background
  4. Contextual notes section with relevant warnings/info based on table name and action type

**Table name context map** (hardcoded helper):
```typescript
const TABLE_CONTEXT: Record<string, string> = {
  settlements: 'Driver payment settlements',
  drivers: 'Driver records and profiles',
  driver_payroll: 'Driver payroll entries',
  incidents: 'Safety incident reports',
  fleet_loads: 'Load/shipment records',
  trucks: 'Fleet truck records',
  // etc.
};
```
