-- 1. Employment type enum + column on drivers
DO $$ BEGIN
  CREATE TYPE public.employment_type_enum AS ENUM ('w2_company', '1099_contractor', 'lease_purchase');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS employment_type public.employment_type_enum NOT NULL DEFAULT 'w2_company';

-- Extend self-update guard to also block employment_type changes by the driver themselves
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
     OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
  THEN
    RAISE EXCEPTION 'Drivers are not permitted to modify identity, pay, banking, or compliance fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Lease purchase agreements table
CREATE TABLE IF NOT EXISTS public.lease_purchase_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  weekly_lease_amount numeric(12,2) NOT NULL DEFAULT 0,
  escrow_cpm_rate numeric(8,4) NOT NULL DEFAULT 0,
  current_escrow_balance numeric(12,2) NOT NULL DEFAULT 0,
  total_weeks_remaining integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. GRANTs (before RLS / policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_purchase_agreements TO authenticated;
GRANT ALL ON public.lease_purchase_agreements TO service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS lease_purchase_agreements_org_idx ON public.lease_purchase_agreements(org_id);
CREATE INDEX IF NOT EXISTS lease_purchase_agreements_driver_idx ON public.lease_purchase_agreements(driver_id);
CREATE INDEX IF NOT EXISTS lease_purchase_agreements_truck_idx ON public.lease_purchase_agreements(truck_id);
CREATE INDEX IF NOT EXISTS lease_purchase_agreements_active_driver_idx
  ON public.lease_purchase_agreements(driver_id) WHERE status = 'active';

-- Auto-fill org_id from authenticated user
CREATE OR REPLACE FUNCTION public.set_lease_purchase_org_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_lease_purchase_org_id ON public.lease_purchase_agreements;
CREATE TRIGGER trg_set_lease_purchase_org_id
  BEFORE INSERT ON public.lease_purchase_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_lease_purchase_org_id();

DROP TRIGGER IF EXISTS trg_update_lease_purchase_updated_at ON public.lease_purchase_agreements;
CREATE TRIGGER trg_update_lease_purchase_updated_at
  BEFORE UPDATE ON public.lease_purchase_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.lease_purchase_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view lease agreements"
  ON public.lease_purchase_agreements FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR driver_id = public.get_driver_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Owners and payroll admins can insert lease agreements"
  ON public.lease_purchase_agreements FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
    )
  );

CREATE POLICY "Owners and payroll admins can update lease agreements"
  ON public.lease_purchase_agreements FOR UPDATE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
    )
  )
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
    )
  );

CREATE POLICY "Owners and payroll admins can delete lease agreements"
  ON public.lease_purchase_agreements FOR DELETE
  TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
    )
  );
