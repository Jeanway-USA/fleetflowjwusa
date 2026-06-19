ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS remaining_drive_hours numeric(4,2),
  ADD COLUMN IF NOT EXISTS remaining_cycle_hours numeric(4,2),
  ADD COLUMN IF NOT EXISTS hos_last_updated timestamptz;

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
     OR NEW.license_number IS DISTINCT FROM OLD.license_number
     OR NEW.license_state IS DISTINCT FROM OLD.license_state
     OR NEW.license_expiry IS DISTINCT FROM OLD.license_expiry
     OR NEW.medical_card_expiry IS DISTINCT FROM OLD.medical_card_expiry
     OR NEW.mvr_expiry IS DISTINCT FROM OLD.mvr_expiry
     OR NEW.hazmat_expiry IS DISTINCT FROM OLD.hazmat_expiry
     OR NEW.twic_expiry IS DISTINCT FROM OLD.twic_expiry
     OR NEW.has_twic IS DISTINCT FROM OLD.has_twic
     OR NEW.endorsements IS DISTINCT FROM OLD.endorsements
     OR NEW.fast_card_passport_expiry IS DISTINCT FROM OLD.fast_card_passport_expiry
     OR NEW.dod_clearance_level IS DISTINCT FROM OLD.dod_clearance_level
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify identity, pay, banking, or compliance fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;