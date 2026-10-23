-- Deactivate and reactivate people instead of deleting them.
-- Run in the Supabase SQL editor (or through Lovable) when the Team tab "Deactivate" change is merged. Safe to run twice.
--
-- Deactivating blocks the person's login and signs them out. Their loads, pay records, signed documents and history
-- all stay exactly as they are, and reactivating puts them back. Nothing here deletes business data (the only rows
-- removed are the person's live login sessions, which is what signs them out).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE OR REPLACE FUNCTION public.deactivate_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _target_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Only an owner can deactivate people'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot deactivate your own account'; END IF;

  SELECT org_id INTO _target_org FROM public.profiles WHERE user_id = _user_id;
  IF _target_org IS NULL OR _target_org <> _org THEN RAISE EXCEPTION 'That person is not in your organization'; END IF;

  -- Never lock the company out: someone must remain an active owner.
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner' AND org_id = _org)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id = r.user_id
       WHERE r.role = 'owner' AND r.org_id = _org AND r.user_id <> _user_id AND p.deactivated_at IS NULL
     ) THEN
    RAISE EXCEPTION 'There must be at least one other active owner first';
  END IF;

  UPDATE public.profiles SET deactivated_at = now() WHERE user_id = _user_id;
  UPDATE auth.users SET banned_until = 'infinity' WHERE id = _user_id;
  DELETE FROM auth.sessions WHERE user_id = _user_id;

  UPDATE public.employees SET status = 'inactive' WHERE user_id = _user_id AND archived_at IS NULL;
  UPDATE public.drivers SET status = 'inactive' WHERE user_id = _user_id AND status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _target_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Only an owner can reactivate people'; END IF;

  SELECT org_id INTO _target_org FROM public.profiles WHERE user_id = _user_id;
  IF _target_org IS NULL OR _target_org <> _org THEN RAISE EXCEPTION 'That person is not in your organization'; END IF;

  UPDATE public.profiles SET deactivated_at = NULL WHERE user_id = _user_id;
  UPDATE auth.users SET banned_until = NULL WHERE id = _user_id;

  UPDATE public.employees SET status = 'active' WHERE user_id = _user_id AND archived_at IS NULL;
  UPDATE public.drivers SET status = 'active' WHERE user_id = _user_id AND status = 'inactive';
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reactivate_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_user(uuid) TO authenticated;
