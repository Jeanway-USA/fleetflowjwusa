-- 1) Add SELECT policy for drivers on driver_banking_info (metadata only — sensitive cols are encrypted)
DROP POLICY IF EXISTS "Drivers can view their own banking metadata" ON public.driver_banking_info;
CREATE POLICY "Drivers can view their own banking metadata"
ON public.driver_banking_info
FOR SELECT
TO authenticated
USING (
  driver_id = public.get_driver_id_for_user(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
);

-- 2) Extend driver self-update guard to also block direct_deposit_attachment_url
CREATE OR REPLACE FUNCTION public.prevent_driver_self_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_is_self boolean;
BEGIN
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
$function$;
