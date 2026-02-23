

## Enforce NOT NULL on org_id Columns

### Current State

All 7 core tables (`fleet_loads`, `agency_loads`, `drivers`, `trucks`, `settlements`, `driver_payroll`, `expenses`) already have:
- An `org_id` column (currently nullable)
- Comprehensive RLS policies that combine role checks with `org_id = get_user_org_id(auth.uid())` on every operation
- The `get_user_org_id()` security definer function to avoid recursion

There are **zero rows** with NULL `org_id` in any of these tables, so adding `NOT NULL` is safe.

The existing RLS policies are **already bulletproof** -- they all enforce org-level isolation. No policies need to be dropped or recreated.

### What This Migration Does

A single `ALTER TABLE ... ALTER COLUMN org_id SET NOT NULL` for each of the 7 tables:

```
fleet_loads
agency_loads
drivers
trucks
settlements
driver_payroll
expenses
```

This is the only remaining gap: without `NOT NULL`, a bug in application code could theoretically insert a row with no `org_id`, bypassing tenant isolation. Adding the constraint makes the database itself reject such inserts.

### No Other Changes Needed

- **RLS policies**: Already enforce org isolation on all operations (verified by inspecting all 22+ policies across these tables). No need to drop or recreate anything.
- **`get_user_org_id()` function**: Already exists as a security definer function, preventing recursion.
- **Frontend code**: Already passes `org_id` in all mutations (per the existing multi-tenant pattern documented in project memory).

