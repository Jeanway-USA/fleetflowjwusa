
-- 1. Remember original org while impersonating
ALTER TABLE public.super_admins
  ADD COLUMN IF NOT EXISTS original_org_id uuid;

-- 2. Start impersonation: store real org, swap profile to target
CREATE OR REPLACE FUNCTION public.super_admin_start_impersonation(target_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current_org uuid;
  _existing_original uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'target_org_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = target_org_id) THEN
    RAISE EXCEPTION 'Target organization does not exist';
  END IF;

  SELECT org_id INTO _current_org FROM public.profiles WHERE user_id = _uid;
  SELECT original_org_id INTO _existing_original FROM public.super_admins WHERE user_id = _uid;

  -- Only capture the real org the first time impersonation begins.
  IF _existing_original IS NULL THEN
    UPDATE public.super_admins
      SET original_org_id = _current_org
      WHERE user_id = _uid;
  END IF;

  UPDATE public.profiles
    SET org_id = target_org_id, updated_at = now()
    WHERE user_id = _uid;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (_uid, 'impersonation_started', 'organizations', target_org_id,
          jsonb_build_object('from_org', COALESCE(_existing_original, _current_org), 'to_org', target_org_id),
          target_org_id);
END;
$$;

-- 3. Stop impersonation: restore real org
CREATE OR REPLACE FUNCTION public.super_admin_stop_impersonation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _original uuid;
  _current_org uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT original_org_id INTO _original FROM public.super_admins WHERE user_id = _uid;
  SELECT org_id INTO _current_org FROM public.profiles WHERE user_id = _uid;

  IF _original IS NULL THEN
    -- Nothing to restore.
    RETURN;
  END IF;

  UPDATE public.profiles
    SET org_id = _original, updated_at = now()
    WHERE user_id = _uid;

  UPDATE public.super_admins
    SET original_org_id = NULL
    WHERE user_id = _uid;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (_uid, 'impersonation_stopped', 'organizations', _current_org,
          jsonb_build_object('from_org', _current_org, 'to_org', _original),
          _original);
END;
$$;

-- 4. Helper to detect active impersonation (returns the original org id, or null)
CREATE OR REPLACE FUNCTION public.super_admin_impersonation_state()
RETURNS TABLE(original_org_id uuid, impersonating_org_id uuid, impersonating_org_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT is_super_admin() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT sa.original_org_id,
         p.org_id,
         o.name
    FROM public.super_admins sa
    JOIN public.profiles p ON p.user_id = sa.user_id
    LEFT JOIN public.organizations o ON o.id = p.org_id
   WHERE sa.user_id = _uid
     AND sa.original_org_id IS NOT NULL;
END;
$$;
