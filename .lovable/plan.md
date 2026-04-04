

## Plan: Add Individual Delete Button to Org Actions

### Overview
Add a "Delete Organization" option to each organization's action dropdown in the Super Admin panel, with a confirmation dialog. This requires a new database function and a frontend update.

### Database Migration
Create a `super_admin_delete_org` function that:
- Requires super admin privileges
- Protects the demo org (`a0000000-0000-0000-0000-000000000001`)
- Cascades deletion of all related data (profiles, loads, expenses, etc.) before deleting the org
- Returns void

```sql
CREATE OR REPLACE FUNCTION public.super_admin_delete_org(target_org_id uuid)
RETURNS void ...
```

The function will delete from all child tables (same pattern as `super_admin_reset_demo`) then delete the organization row.

### Frontend Changes

**`src/components/superadmin/OrgActionsDropdown.tsx`**:
- Add a `deleteOpen` state for a confirmation dialog
- Add a `deleteOrg` mutation calling the new RPC
- Add a "Delete Organization" menu item (red, destructive styling) after a separator
- Add an AlertDialog confirmation with the org name displayed
- Protect the demo org by disabling the option if `org.id === 'a0000000-...'`

### Files
| File | Action |
|------|--------|
| Migration SQL | New `super_admin_delete_org` function |
| `src/components/superadmin/OrgActionsDropdown.tsx` | Add delete menu item + confirmation dialog |

