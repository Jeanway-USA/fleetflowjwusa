
-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.onboarding_review_status AS ENUM ('pending', 'approved', 'revision_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Columns on driver_signed_documents
ALTER TABLE public.driver_signed_documents
  ADD COLUMN IF NOT EXISTS review_status public.onboarding_review_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS revision_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 3. Columns on drivers (credentials step review)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS credentials_review_status public.onboarding_review_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS credentials_revision_notes text,
  ADD COLUMN IF NOT EXISTS credentials_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS credentials_reviewed_at timestamptz;

-- 4. UPDATE policies for admins on driver_signed_documents
DROP POLICY IF EXISTS "Owner payroll can update signed document review" ON public.driver_signed_documents;
CREATE POLICY "Owner payroll can update signed document review"
ON public.driver_signed_documents
FOR UPDATE
TO authenticated
USING (
  (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role))
  AND org_id = public.get_user_org_id(auth.uid())
)
WITH CHECK (
  (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'::app_role))
  AND org_id = public.get_user_org_id(auth.uid())
);

DROP POLICY IF EXISTS "Safety can update non-banking signed document review" ON public.driver_signed_documents;
CREATE POLICY "Safety can update non-banking signed document review"
ON public.driver_signed_documents
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'safety'::app_role)
  AND org_id = public.get_user_org_id(auth.uid())
  AND document_type <> 'direct_deposit'
)
WITH CHECK (
  public.has_role(auth.uid(), 'safety'::app_role)
  AND org_id = public.get_user_org_id(auth.uid())
  AND document_type <> 'direct_deposit'
);

-- Allow drivers to update their own document (needed for re-sign which keeps the row id) -- they already insert new rows on resubmit, but in case of update we keep it scoped tightly. Drivers can NOT change review fields themselves.
-- (Skip: current flow inserts a new row each resubmit; trigger below handles reset.)

-- 5. Reset triggers
CREATE OR REPLACE FUNCTION public.reset_signed_document_review_on_resubmit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.file_path IS DISTINCT FROM OLD.file_path AND OLD.review_status = 'revision_requested' THEN
    NEW.review_status := 'pending';
    NEW.revision_notes := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_signed_document_review ON public.driver_signed_documents;
CREATE TRIGGER trg_reset_signed_document_review
BEFORE UPDATE ON public.driver_signed_documents
FOR EACH ROW
EXECUTE FUNCTION public.reset_signed_document_review_on_resubmit();

CREATE OR REPLACE FUNCTION public.reset_driver_credentials_review_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.credentials_review_status = 'revision_requested' AND (
       NEW.license_number IS DISTINCT FROM OLD.license_number
    OR NEW.license_state IS DISTINCT FROM OLD.license_state
    OR NEW.license_expiry IS DISTINCT FROM OLD.license_expiry
    OR NEW.medical_card_expiry IS DISTINCT FROM OLD.medical_card_expiry
    OR NEW.mvr_expiry IS DISTINCT FROM OLD.mvr_expiry
    OR NEW.hazmat_expiry IS DISTINCT FROM OLD.hazmat_expiry
    OR NEW.twic_expiry IS DISTINCT FROM OLD.twic_expiry
    OR NEW.has_twic IS DISTINCT FROM OLD.has_twic
    OR NEW.endorsements IS DISTINCT FROM OLD.endorsements
    OR NEW.phone IS DISTINCT FROM OLD.phone
  ) THEN
    NEW.credentials_review_status := 'pending';
    NEW.credentials_revision_notes := NULL;
    NEW.credentials_reviewed_by := NULL;
    NEW.credentials_reviewed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_driver_credentials_review ON public.drivers;
CREATE TRIGGER trg_reset_driver_credentials_review
BEFORE UPDATE ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.reset_driver_credentials_review_on_change();
