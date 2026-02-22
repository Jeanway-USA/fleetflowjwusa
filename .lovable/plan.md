

## Fix: Organization creation blocked by RLS policy

### Problem
The "Authenticated users can create orgs" INSERT policy on the `organizations` table is set as **RESTRICTIVE** instead of **PERMISSIVE**. PostgreSQL requires at least one permissive policy to grant access before restrictive policies can further narrow it. With no permissive INSERT policy, every insert is denied -- causing the "Failed to create organization" error during onboarding.

### Solution
Drop the existing restrictive INSERT policy and recreate it as a permissive policy with the same check.

### Technical Details

**Database migration:**
```sql
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;

CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

No code changes needed -- the `Onboarding.tsx` insert logic is correct. This is purely a database policy fix.
