-- Safety page (Nov 2026). Run once through Lovable. Safe to run again.
-- 1) A private place for safety paperwork: a driver's MVR copy, inspection reports, Landstar approval letters, training
--    certificates. Only the owner and the safety role can see or add to it. Files are never deleted: replacing a file archives
--    the old one and it stays on record.
-- 2) The date Landstar approved each driver.

CREATE TABLE IF NOT EXISTS public.safety_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('driver', 'truck', 'trailer', 'company')),
  subject_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mvr', 'medical_card', 'landstar_approval', 'training', 'inspection_report', 'accident_report', 'other')),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  -- The date on the paper itself (the day the MVR was pulled, the day of the inspection).
  doc_date date,
  expires_on date,
  note text,
  uploaded_by uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_files_subject_idx ON public.safety_files (org_id, subject_type, subject_id, kind);

GRANT SELECT, INSERT, UPDATE ON public.safety_files TO authenticated;
GRANT ALL ON public.safety_files TO service_role;
ALTER TABLE public.safety_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_files_select ON public.safety_files;
CREATE POLICY safety_files_select ON public.safety_files FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'safety'::app_role)));
DROP POLICY IF EXISTS safety_files_insert ON public.safety_files;
CREATE POLICY safety_files_insert ON public.safety_files FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'safety'::app_role)));
DROP POLICY IF EXISTS safety_files_update ON public.safety_files;
CREATE POLICY safety_files_update ON public.safety_files FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'safety'::app_role)))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'safety'::app_role)));

-- The day Landstar approved the driver.
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS landstar_approved_on date;
