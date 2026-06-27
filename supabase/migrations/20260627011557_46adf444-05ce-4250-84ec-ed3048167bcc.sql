
-- Table
CREATE TABLE public.tax_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year integer NOT NULL CHECK (tax_year BETWEEN 1990 AND 2100),
  file_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, tax_year, file_path)
);

CREATE INDEX idx_tax_documents_driver_year ON public.tax_documents (driver_id, tax_year DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_documents TO authenticated;
GRANT ALL ON public.tax_documents TO service_role;

ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;

-- Trigger to stamp org_id and uploaded_by
CREATE OR REPLACE FUNCTION public.set_tax_documents_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  IF NEW.uploaded_by IS NULL THEN
    NEW.uploaded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_tax_documents_defaults
BEFORE INSERT ON public.tax_documents
FOR EACH ROW EXECUTE FUNCTION public.set_tax_documents_defaults();

-- Policies
CREATE POLICY "Drivers read own tax documents"
ON public.tax_documents FOR SELECT TO authenticated
USING (driver_id = auth.uid());

CREATE POLICY "Admins read org tax documents"
ON public.tax_documents FOR SELECT TO authenticated
USING (
  public.has_admin_access(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Admins insert tax documents"
ON public.tax_documents FOR INSERT TO authenticated
WITH CHECK (
  public.has_admin_access(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.user_id = tax_documents.driver_id
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "Admins update tax documents"
ON public.tax_documents FOR UPDATE TO authenticated
USING (
  public.has_admin_access(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
)
WITH CHECK (
  public.has_admin_access(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Admins delete tax documents"
ON public.tax_documents FOR DELETE TO authenticated
USING (
  public.has_admin_access(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
);

-- Storage policies for tax-documents bucket
-- Path convention: {driver_user_id}/{tax_year}/{uuid}.pdf
CREATE POLICY "tax-documents: driver reads own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "tax-documents: admins read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
);

CREATE POLICY "tax-documents: admins insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
);

CREATE POLICY "tax-documents: admins update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
);

CREATE POLICY "tax-documents: admins delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
);
