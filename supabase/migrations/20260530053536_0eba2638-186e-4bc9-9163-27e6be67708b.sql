-- Create signed-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-documents', 'signed-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Table to persist signed onboarding documents per driver
CREATE TABLE public.driver_signed_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  template_id uuid,
  document_type text NOT NULL,
  file_path text NOT NULL,
  driver_address text,
  signature_data_url text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.driver_signed_documents TO authenticated;
GRANT ALL ON public.driver_signed_documents TO service_role;

ALTER TABLE public.driver_signed_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert their own signed documents"
ON public.driver_signed_documents
FOR INSERT TO authenticated
WITH CHECK (
  driver_id = get_driver_id_for_user(auth.uid())
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Drivers can view their own signed documents"
ON public.driver_signed_documents
FOR SELECT TO authenticated
USING (
  driver_id = get_driver_id_for_user(auth.uid())
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Owner safety payroll can view org signed documents"
ON public.driver_signed_documents
FOR SELECT TO authenticated
USING (
  (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role) OR has_role(auth.uid(), 'payroll_admin'::app_role))
  AND org_id = get_user_org_id(auth.uid())
);

CREATE INDEX idx_driver_signed_documents_driver ON public.driver_signed_documents(driver_id);
CREATE INDEX idx_driver_signed_documents_org ON public.driver_signed_documents(org_id);

-- Storage policies for signed-documents bucket: {org_id}/{driver_id}/file.pdf
CREATE POLICY "Drivers can upload their own signed documents"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = get_driver_id_for_user(auth.uid())::text
);

CREATE POLICY "Drivers can read their own signed documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = get_driver_id_for_user(auth.uid())::text
);

CREATE POLICY "Owner safety payroll can read org signed documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role) OR has_role(auth.uid(), 'payroll_admin'::app_role))
);