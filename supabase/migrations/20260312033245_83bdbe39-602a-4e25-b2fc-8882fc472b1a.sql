
-- 1. Create super_admins table (keyed on user_id, only service role can write)
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Allow super admins to read their own row (for is_super_admin check via RPC)
CREATE POLICY "Super admins can read own row"
ON public.super_admins FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2. Seed existing super admins by email
INSERT INTO public.super_admins (user_id)
SELECT id FROM auth.users WHERE email IN ('andrew@jeanwayusa.com', 'siadrak@jeanwayusa.com', 'hr@jeanwayusa.com')
ON CONFLICT (user_id) DO NOTHING;

-- 3. Rewrite is_super_admin() to use the table instead of hardcoded emails
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()
  )
$$;

-- 4. Restrict promo_codes: drop the overly permissive policy and replace with super-admin-only
DROP POLICY IF EXISTS "Authenticated users can view promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Anyone can view promo codes" ON public.promo_codes;

CREATE POLICY "Only super admins can view promo codes"
ON public.promo_codes FOR SELECT
TO authenticated
USING (is_super_admin());
