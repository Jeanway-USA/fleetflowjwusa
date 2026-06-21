
-- 1. Block client-side writes to billing/lifecycle columns on organizations.
CREATE OR REPLACE FUNCTION public.prevent_org_billing_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role_name text := current_setting('role', true);
  is_privileged boolean := false;
BEGIN
  -- Allow service_role (webhooks / edge functions using service key) and superuser/postgres maintenance.
  IF current_role_name IN ('service_role', 'postgres', 'supabase_admin') THEN
    is_privileged := true;
  END IF;

  -- Allow internal super admins as well.
  IF NOT is_privileged AND auth.uid() IS NOT NULL AND public.is_super_admin() THEN
    is_privileged := true;
  END IF;

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier      IS DISTINCT FROM OLD.subscription_tier
     OR NEW.is_active           IS DISTINCT FROM OLD.is_active
     OR NEW.is_complimentary    IS DISTINCT FROM OLD.is_complimentary
     OR NEW.complimentary_ends_at IS DISTINCT FROM OLD.complimentary_ends_at
     OR NEW.stripe_customer_id  IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_period_end IS DISTINCT FROM OLD.subscription_period_end
     OR NEW.trial_ends_at       IS DISTINCT FROM OLD.trial_ends_at
  THEN
    RAISE EXCEPTION 'Billing and subscription fields can only be modified by the billing system'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_org_billing_self_update_trg ON public.organizations;
CREATE TRIGGER prevent_org_billing_self_update_trg
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_org_billing_self_update();

-- 2. Messages: require same-org for reads.
DROP POLICY IF EXISTS "Participants can view their messages" ON public.messages;
CREATE POLICY "Participants can view their messages"
ON public.messages
FOR SELECT
USING (
  ((auth.uid() = sender_id) OR (auth.uid() = receiver_id))
  AND org_id = public.get_user_org_id(auth.uid())
);

-- 3. Tighten driver load-upload path: first segment must be literal 'load',
-- the second segment must be a load that belongs to the driver AND their org,
-- and the path must include at least one filename segment beyond that.
DROP POLICY IF EXISTS "Drivers can upload docs for their assigned loads" ON storage.objects;
CREATE POLICY "Drivers can upload docs for their assigned loads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'load'
  AND array_length(storage.foldername(name), 1) >= 2
  AND EXISTS (
    SELECT 1
    FROM public.fleet_loads fl
    WHERE fl.id::text = (storage.foldername(name))[2]
      AND fl.driver_id = public.get_driver_id_for_user(auth.uid())
      AND fl.org_id    = public.get_user_org_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Drivers can view docs for their assigned loads" ON storage.objects;
CREATE POLICY "Drivers can view docs for their assigned loads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'load'
  AND array_length(storage.foldername(name), 1) >= 2
  AND EXISTS (
    SELECT 1
    FROM public.fleet_loads fl
    WHERE fl.id::text = (storage.foldername(name))[2]
      AND fl.driver_id = public.get_driver_id_for_user(auth.uid())
      AND fl.org_id    = public.get_user_org_id(auth.uid())
  )
);
