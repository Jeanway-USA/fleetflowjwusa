
-- Allow drivers to self-update credential fields on their own row,
-- protected by a trigger that blocks changes to sensitive columns.

CREATE OR REPLACE FUNCTION public.prevent_driver_self_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_is_self boolean;
BEGIN
  -- Bypass when run without an auth context (edge functions, service role)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.is_owner(auth.uid())
             OR public.has_role(auth.uid(), 'payroll_admin'::app_role);
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  v_is_self := (OLD.user_id IS NOT NULL AND OLD.user_id = auth.uid());
  IF NOT v_is_self THEN
    RETURN NEW;
  END IF;

  IF NEW.pay_rate IS DISTINCT FROM OLD.pay_rate
     OR NEW.pay_type IS DISTINCT FROM OLD.pay_type
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.hire_date IS DISTINCT FROM OLD.hire_date
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name
     OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.direct_deposit_attachment_url IS DISTINCT FROM OLD.direct_deposit_attachment_url
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify identity, pay, status, or assignment fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drivers_self_update_guard ON public.drivers;
CREATE TRIGGER drivers_self_update_guard
BEFORE UPDATE ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_driver_self_sensitive_update();

DROP POLICY IF EXISTS "Drivers can update their own credentials" ON public.drivers;
CREATE POLICY "Drivers can update their own credentials"
ON public.drivers
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (user_id = auth.uid() AND org_id = public.get_user_org_id(auth.uid()));
