-- Fix 1: Remove overly broad DVIR storage SELECT policies
-- The org-scoped policies "Org members can view dvir photos/signatures" already exist and are correct
DROP POLICY IF EXISTS "Authenticated users can view DVIR photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view DVIR signatures" ON storage.objects;

-- Fix 2: Add restrictive INSERT policy on user_roles to prevent privilege escalation
-- The existing "Owners can manage org roles" ALL policy already restricts to owners,
-- but adding a RESTRICTIVE policy ensures defense-in-depth
CREATE POLICY "Only owners can insert roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));