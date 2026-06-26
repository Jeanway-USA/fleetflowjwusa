
-- 1) Guard create_onboarding_org against already-onboarded users
CREATE OR REPLACE FUNCTION public.create_onboarding_org(_name text, _tier text DEFAULT 'open_beta'::text, _tms_mode text DEFAULT 'landstar'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id uuid;
  _user_id uuid := auth.uid();
  _rows_updated integer;
  _existing_org uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _tier NOT IN ('open_beta', 'solo_bco') THEN RAISE EXCEPTION 'Invalid subscription tier'; END IF;
  IF _tms_mode NOT IN ('landstar', 'independent') THEN RAISE EXCEPTION 'Invalid TMS mode'; END IF;

  -- Block users that already belong to an organization from minting a new one.
  -- This prevents paid subscribers from rotating into a fresh open_beta org to
  -- bypass tier restrictions.
  SELECT org_id INTO _existing_org
    FROM public.profiles
   WHERE user_id = _user_id;

  IF _existing_org IS NOT NULL THEN
    RAISE EXCEPTION 'User is already a member of an organization'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organizations (name, subscription_tier, subscription_status, tms_mode)
  VALUES (_name, _tier, 'active', _tms_mode)
  RETURNING id INTO _org_id;

  UPDATE public.profiles SET org_id = _org_id WHERE user_id = _user_id;
  GET DIAGNOSTICS _rows_updated = ROW_COUNT;
  IF _rows_updated = 0 THEN
    INSERT INTO public.profiles (user_id, org_id) VALUES (_user_id, _org_id);
  END IF;

  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (_user_id, _org_id, 'owner'::app_role)
  ON CONFLICT DO NOTHING;

  RETURN _org_id;
END;
$function$;

-- 2) Subscription tier feature enforcement at the database layer.
--    Mirrors src/hooks/useSubscriptionTier.ts so client-side gating cannot
--    be bypassed by calling the REST/Supabase API directly.
CREATE OR REPLACE FUNCTION public.current_org_has_feature(_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.organizations o ON o.id = p.org_id
     WHERE p.user_id = auth.uid()
       AND (
            o.subscription_tier IN ('open_beta', 'all_in_one')
         OR (o.subscription_tier = 'solo_bco'
             AND _feature = ANY (ARRAY['loads','ifta','maintenance_basic','documents','profit_loss','crm_basic']))
         OR (o.subscription_tier = 'fleet_owner'
             AND _feature = ANY (ARRAY[
               'loads','ifta','maintenance_basic','documents','profit_loss','crm_basic',
               'drivers','dispatch','settlements','fleet_analytics','gps_tracking',
               'payroll','driver_performance','maintenance_full','trucks','trailers',
               'incidents','safety','executive_dashboard'
             ]))
         OR (o.subscription_tier = 'agency'
             AND _feature = ANY (ARRAY['agency_loads','carrier_vetting','commissions','crm','load_board','documents','insights']))
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_org_has_feature(text) TO authenticated;

-- Restrictive INSERT policies — combine with existing permissive policies so
-- a user must STILL pass their org's tier check before creating restricted rows.
-- Reads are intentionally not gated so previously-created data remains visible
-- if a plan is downgraded; only new writes are blocked.

DROP POLICY IF EXISTS tier_gate_drivers_insert ON public.drivers;
CREATE POLICY tier_gate_drivers_insert ON public.drivers
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('drivers'));

DROP POLICY IF EXISTS tier_gate_trucks_insert ON public.trucks;
CREATE POLICY tier_gate_trucks_insert ON public.trucks
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('trucks'));

DROP POLICY IF EXISTS tier_gate_trailers_insert ON public.trailers;
CREATE POLICY tier_gate_trailers_insert ON public.trailers
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('trailers'));

DROP POLICY IF EXISTS tier_gate_driver_settlements_insert ON public.driver_settlements;
CREATE POLICY tier_gate_driver_settlements_insert ON public.driver_settlements
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('settlements'));

DROP POLICY IF EXISTS tier_gate_driver_settlement_items_insert ON public.driver_settlement_items;
CREATE POLICY tier_gate_driver_settlement_items_insert ON public.driver_settlement_items
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('settlements'));

DROP POLICY IF EXISTS tier_gate_driver_payroll_insert ON public.driver_payroll;
CREATE POLICY tier_gate_driver_payroll_insert ON public.driver_payroll
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('payroll'));

DROP POLICY IF EXISTS tier_gate_incidents_insert ON public.incidents;
CREATE POLICY tier_gate_incidents_insert ON public.incidents
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('incidents'));

DROP POLICY IF EXISTS tier_gate_agency_loads_insert ON public.agency_loads;
CREATE POLICY tier_gate_agency_loads_insert ON public.agency_loads
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('agency_loads'));

DROP POLICY IF EXISTS tier_gate_agent_commissions_insert ON public.agent_commissions;
CREATE POLICY tier_gate_agent_commissions_insert ON public.agent_commissions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_org_has_feature('commissions'));
