-- Drop existing policies and recreate with proper access
DROP POLICY IF EXISTS "Admin roles can manage company resources" ON public.company_resources;
DROP POLICY IF EXISTS "Authenticated users can view company resources" ON public.company_resources;

-- Create proper policies
-- All authenticated users can view resources (read-only)
CREATE POLICY "Authenticated users can view company resources"
ON public.company_resources
FOR SELECT
TO authenticated
USING (true);

-- Admin roles can insert, update, delete
CREATE POLICY "Admin roles can insert company resources"
ON public.company_resources
FOR INSERT
TO authenticated
WITH CHECK (has_admin_access(auth.uid()));

CREATE POLICY "Admin roles can update company resources"
ON public.company_resources
FOR UPDATE
TO authenticated
USING (has_admin_access(auth.uid()));

CREATE POLICY "Admin roles can delete company resources"
ON public.company_resources
FOR DELETE
TO authenticated
USING (has_admin_access(auth.uid()));