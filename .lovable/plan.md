

## Auto-delete inactive organizations with 0 users

### Approach
Create a database function `auto_cleanup_empty_orgs()` that deletes organizations where `is_active = false` AND `user_count = 0` (no profiles linked). This function will be called in two places:

1. **On deactivation** — After `super_admin_update_org` sets `is_active = false`, automatically check and delete if no users remain.
2. **Immediate cleanup** — Run once now to purge the existing orphan orgs visible in the screenshot.

### Database Migration

Create a new `SECURITY DEFINER` function that:
- Deletes organizations where `is_active = false` and no profiles reference the `org_id`
- Protects the demo org from accidental deletion
- Returns the count of deleted orgs

Then modify `super_admin_update_org` to call this cleanup after updating, so any org deactivated with 0 users is immediately removed.

```sql
-- Cleanup function
CREATE OR REPLACE FUNCTION public.auto_cleanup_empty_orgs()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE deleted_count integer;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  
  DELETE FROM organizations
  WHERE is_active = false
    AND id NOT IN (SELECT DISTINCT org_id FROM profiles WHERE org_id IS NOT NULL)
    AND id != 'a0000000-0000-0000-0000-000000000001' -- protect demo/JeanWay
  RETURNING 1;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
```

Update `super_admin_update_org` to auto-cleanup after setting `is_active = false`:
```sql
-- At the end of super_admin_update_org, after the UPDATE:
IF new_is_active = false THEN
  DELETE FROM organizations
  WHERE id = target_org_id
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE org_id = target_org_id);
END IF;
```

### Data Cleanup
Run a one-time delete to purge the three "My Trucking Company" inactive/0-user orgs currently in the database.

### Frontend
Add a "Purge Empty Orgs" button to the Organizations tab header that calls `auto_cleanup_empty_orgs()` for manual bulk cleanup when needed.

### Files
| Target | Change |
|--------|--------|
| New migration | Create `auto_cleanup_empty_orgs` function; update `super_admin_update_org` to auto-delete on deactivation |
| Data operation | Delete existing orphan inactive orgs |
| `SuperAdminDashboard.tsx` | Add purge button to Organizations tab |

