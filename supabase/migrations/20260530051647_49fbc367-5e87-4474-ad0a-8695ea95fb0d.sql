CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  document_type text NOT NULL,
  name text,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_document_templates_org_type ON public.document_templates(org_id, document_type);
CREATE UNIQUE INDEX uniq_document_templates_active_per_type ON public.document_templates(org_id, document_type) WHERE is_active;

CREATE POLICY "templates_select_org_staff"
ON public.document_templates
FOR SELECT
TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "templates_manage_owner"
ON public.document_templates
FOR ALL
TO authenticated
USING (public.is_owner(auth.uid()) AND org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()) AND org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "templates_super_admin"
ON public.document_templates
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE TRIGGER update_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();