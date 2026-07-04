-- 1. Add gusto_employee_id to drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS gusto_employee_id text;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_gusto_employee_uk
  ON public.drivers (org_id, gusto_employee_id)
  WHERE gusto_employee_id IS NOT NULL;

-- 2. gusto_integration table (one row per org)
CREATE TABLE IF NOT EXISTS public.gusto_integration (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  gusto_company_uuid text,
  access_token_encrypted bytea,
  refresh_token_encrypted bytea,
  token_expires_at timestamptz,
  onboarding_status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. GRANTS: read-only for owners/payroll_admin via RLS; all writes via service_role
GRANT SELECT ON public.gusto_integration TO authenticated;
GRANT ALL ON public.gusto_integration TO service_role;

-- 4. RLS
ALTER TABLE public.gusto_integration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gusto_integration_select_owner_payroll"
ON public.gusto_integration
FOR SELECT
TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.is_owner(auth.uid())
    OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
  )
);

-- Explicitly deny client-side writes (no INSERT/UPDATE/DELETE policies = locked)
-- service_role bypasses RLS.

-- 5. updated_at trigger
DROP TRIGGER IF EXISTS trg_gusto_integration_updated_at ON public.gusto_integration;
CREATE TRIGGER trg_gusto_integration_updated_at
BEFORE UPDATE ON public.gusto_integration
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Security-definer helpers so only the edge function (service role) can decrypt/store tokens
CREATE OR REPLACE FUNCTION public.gusto_get_tokens(_org_id uuid)
RETURNS TABLE (
  gusto_company_uuid text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  onboarding_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key text;
  _caller text := current_setting('role', true);
BEGIN
  -- Only service_role or super admin may decrypt
  IF _caller NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  RETURN QUERY
  SELECT
    gi.gusto_company_uuid,
    CASE WHEN gi.access_token_encrypted IS NOT NULL
         THEN pgp_sym_decrypt(gi.access_token_encrypted, _key) ELSE NULL END,
    CASE WHEN gi.refresh_token_encrypted IS NOT NULL
         THEN pgp_sym_decrypt(gi.refresh_token_encrypted, _key) ELSE NULL END,
    gi.token_expires_at,
    gi.onboarding_status
  FROM public.gusto_integration gi
  WHERE gi.org_id = _org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gusto_set_tokens(
  _org_id uuid,
  _company_uuid text,
  _access_token text,
  _refresh_token text,
  _token_expires_at timestamptz,
  _onboarding_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _key text;
  _caller text := current_setting('role', true);
BEGIN
  IF _caller NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _key FROM public.internal_config WHERE key = 'banking_encryption_key';
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  INSERT INTO public.gusto_integration AS gi (
    org_id, gusto_company_uuid,
    access_token_encrypted, refresh_token_encrypted,
    token_expires_at, onboarding_status, last_synced_at
  ) VALUES (
    _org_id,
    _company_uuid,
    CASE WHEN _access_token IS NULL THEN NULL ELSE pgp_sym_encrypt(_access_token, _key) END,
    CASE WHEN _refresh_token IS NULL THEN NULL ELSE pgp_sym_encrypt(_refresh_token, _key) END,
    _token_expires_at,
    COALESCE(_onboarding_status, 'pending'),
    now()
  )
  ON CONFLICT (org_id) DO UPDATE SET
    gusto_company_uuid = COALESCE(EXCLUDED.gusto_company_uuid, gi.gusto_company_uuid),
    access_token_encrypted = COALESCE(EXCLUDED.access_token_encrypted, gi.access_token_encrypted),
    refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, gi.refresh_token_encrypted),
    token_expires_at = COALESCE(EXCLUDED.token_expires_at, gi.token_expires_at),
    onboarding_status = COALESCE(_onboarding_status, gi.onboarding_status),
    last_synced_at = now(),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.gusto_get_tokens(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.gusto_set_tokens(uuid, text, text, text, timestamptz, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.gusto_get_tokens(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gusto_set_tokens(uuid, text, text, text, timestamptz, text) TO service_role;