
-- ============================================================
-- RLS SECURITY HARDENING MIGRATION
-- Fixes critical privilege escalation + defense-in-depth
-- ============================================================

-- ===========================================
-- FIX 1: Patch role-checking functions to filter by org_id
-- Prevents cross-org privilege escalation
-- ===========================================

CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'owner'
      AND org_id = get_user_org_id(_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND org_id = get_user_org_id(_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'payroll_admin', 'dispatcher', 'safety')
      AND org_id = get_user_org_id(_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_operations_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'dispatcher')
      AND org_id = get_user_org_id(_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_payroll_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'payroll_admin')
      AND org_id = get_user_org_id(_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_safety_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'safety')
      AND org_id = get_user_org_id(_user_id)
  )
$$;

-- ===========================================
-- FIX 2: Restrict profiles UPDATE to prevent org_id tampering
-- ===========================================

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (org_id IS NOT DISTINCT FROM get_user_org_id(auth.uid()))
);

-- ===========================================
-- FIX 3: Restrict promo_codes SELECT to authenticated only
-- ===========================================

DROP POLICY IF EXISTS "Anyone can view promo codes" ON public.promo_codes;

CREATE POLICY "Authenticated users can view promo codes"
ON public.promo_codes
FOR SELECT
TO authenticated
USING (true);

-- ===========================================
-- FIX 4: Fix driver_settings_safe view with security_invoker
-- ===========================================

DROP VIEW IF EXISTS public.driver_settings_safe;

CREATE VIEW public.driver_settings_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  driver_id,
  weekly_miles_goal,
  weekly_revenue_goal,
  theme_preference,
  landstar_username,
  created_at,
  updated_at
FROM public.driver_settings;

-- Revoke anon access, grant only to authenticated
REVOKE ALL ON public.driver_settings_safe FROM anon;
GRANT SELECT ON public.driver_settings_safe TO authenticated;

-- ===========================================
-- FIX 5: Restrict organizations INSERT policy
-- The create_onboarding_org RPC (SECURITY DEFINER) handles
-- legitimate org creation. Block direct INSERT.
-- ===========================================

DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;

-- No replacement INSERT policy needed — the SECURITY DEFINER
-- RPC bypasses RLS for legitimate onboarding.

-- ===========================================
-- FIX 6: Revoke anon access to super_admin views
-- ===========================================

REVOKE ALL ON public.super_admin_dashboard_data FROM anon;
REVOKE ALL ON public.super_admin_organizations FROM anon;
REVOKE ALL ON public.super_admin_usage_metrics FROM anon;
REVOKE ALL ON public.super_admin_audit_logs FROM anon;

-- Grant only to authenticated (views already self-gate via is_super_admin())
GRANT SELECT ON public.super_admin_dashboard_data TO authenticated;
GRANT SELECT ON public.super_admin_organizations TO authenticated;
GRANT SELECT ON public.super_admin_usage_metrics TO authenticated;
GRANT SELECT ON public.super_admin_audit_logs TO authenticated;

-- ===========================================
-- FIX 7: Harden storage — enforce org-scoped document uploads
-- ===========================================

-- Drop overly permissive documents upload policy
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;

-- Replace with org-scoped upload: folder must start with user's org_id
CREATE POLICY "Org-scoped document uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
);

-- Tighten document view to org-scoped
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;

CREATE POLICY "Org members can view documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
);

-- Tighten dvir-photos upload to user-folder scoped
DROP POLICY IF EXISTS "Drivers can upload their own DVIR photos" ON storage.objects;

CREATE POLICY "Drivers can upload org-scoped DVIR photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dvir-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Tighten dvir-signatures upload to user-folder scoped
DROP POLICY IF EXISTS "Drivers can upload their own signatures" ON storage.objects;

CREATE POLICY "Drivers can upload org-scoped signatures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dvir-signatures'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
