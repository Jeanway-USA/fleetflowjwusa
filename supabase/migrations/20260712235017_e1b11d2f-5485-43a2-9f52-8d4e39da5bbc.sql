
-- Drop the duplicate trigger; keep trg_prevent_driver_self_sensitive_update.
DROP TRIGGER IF EXISTS drivers_self_update_guard ON public.drivers;

CREATE OR REPLACE FUNCTION public.prevent_driver_self_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_is_self boolean;
  v_in_onboarding boolean;
  v_profile record;
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

  -- Hard block: identity/pay/org/status/banking fields can NEVER be
  -- self-modified by the driver, even during onboarding.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.pay_rate IS DISTINCT FROM OLD.pay_rate
     OR NEW.pay_type IS DISTINCT FROM OLD.pay_type
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.hire_date IS DISTINCT FROM OLD.hire_date
     OR NEW.direct_deposit_attachment_url IS DISTINCT FROM OLD.direct_deposit_attachment_url
     OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify identity, pay, or status fields'
      USING ERRCODE = '42501';
  END IF;

  -- Determine whether the driver is still onboarding or under revision.
  SELECT onboarding_completed, requires_onboarding
    INTO v_profile
    FROM public.profiles
   WHERE user_id = auth.uid()
   LIMIT 1;

  v_in_onboarding :=
       COALESCE(v_profile.onboarding_completed, false) = false
    OR COALESCE(v_profile.requires_onboarding, false) = true
    OR OLD.credentials_review_status IS NULL
    OR OLD.credentials_review_status IN ('revision_requested', 'pending');

  IF v_in_onboarding THEN
    RETURN NEW;
  END IF;

  -- Post-onboarding: block edits to compliance fields UNLESS the OLD value
  -- was NULL (first-time fill for a legacy driver missing that data).
  IF (NEW.license_number IS DISTINCT FROM OLD.license_number AND OLD.license_number IS NOT NULL)
     OR (NEW.license_state IS DISTINCT FROM OLD.license_state AND OLD.license_state IS NOT NULL)
     OR (NEW.license_expiry IS DISTINCT FROM OLD.license_expiry AND OLD.license_expiry IS NOT NULL)
     OR (NEW.medical_card_expiry IS DISTINCT FROM OLD.medical_card_expiry AND OLD.medical_card_expiry IS NOT NULL)
     OR (NEW.mvr_expiry IS DISTINCT FROM OLD.mvr_expiry AND OLD.mvr_expiry IS NOT NULL)
     OR (NEW.hazmat_expiry IS DISTINCT FROM OLD.hazmat_expiry AND OLD.hazmat_expiry IS NOT NULL)
     OR (NEW.twic_expiry IS DISTINCT FROM OLD.twic_expiry AND OLD.twic_expiry IS NOT NULL)
     OR (NEW.has_twic IS DISTINCT FROM OLD.has_twic AND OLD.has_twic IS NOT NULL)
     OR (NEW.endorsements IS DISTINCT FROM OLD.endorsements AND OLD.endorsements IS NOT NULL)
     OR (NEW.fast_card_passport_expiry IS DISTINCT FROM OLD.fast_card_passport_expiry AND OLD.fast_card_passport_expiry IS NOT NULL)
     OR (NEW.dod_clearance_level IS DISTINCT FROM OLD.dod_clearance_level AND OLD.dod_clearance_level IS NOT NULL)
     OR (NEW.employment_type IS DISTINCT FROM OLD.employment_type AND OLD.employment_type IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify compliance fields after onboarding'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
