

## Fix: CRM Contact Creation RLS Error on `company_resources`

**Root Cause**: When creating an Agent/Load Agent contact, the insert into `company_resources` does not include `org_id`. The RLS policy requires `org_id = get_user_org_id(auth.uid())`, so a `NULL` org_id fails the check.

The same issue likely applies to `facilities` and `crm_contacts` inserts as well.

### Changes

**File: `src/components/crm/ContactFormDialog.tsx`**

Add `org_id` to all three insert payloads (resource, facility, CRM contact) by fetching it from the auth context:

1. Import `useAuth` and get `orgId` from it
2. Add `org_id: orgId` to `resourcePayload`, `facilityPayload`, and `crmPayload`

This ensures the inserted row passes the RLS `WITH CHECK` condition on all three tables.

| File | Change |
|------|--------|
| `src/components/crm/ContactFormDialog.tsx` | Add `org_id` to all insert payloads |

No database changes needed — the column exists and accepts the value; it just wasn't being provided.

