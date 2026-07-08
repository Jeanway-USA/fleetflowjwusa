
-- 1. Enum for instance status
DO $$ BEGIN
  CREATE TYPE public.document_status AS ENUM ('draft','pending_signatures','completed','voided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend document_templates
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS signatory_roles text[] NOT NULL DEFAULT ARRAY['driver']::text[],
  ADD COLUMN IF NOT EXISTS required_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. document_instances
CREATE TABLE IF NOT EXISTS public.document_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  status public.document_status NOT NULL DEFAULT 'pending_signatures',
  signatory_roles text[] NOT NULL DEFAULT ARRAY['driver']::text[],
  current_step integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_storage_path text,
  assigned_to_user uuid,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_instances TO authenticated;
GRANT ALL ON public.document_instances TO service_role;
ALTER TABLE public.document_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instances_select_org" ON public.document_instances
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "instances_insert_admin" ON public.document_instances
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
      OR public.has_role(auth.uid(), 'dispatcher'::app_role)
      OR public.has_role(auth.uid(), 'safety'::app_role)
    )
  );

CREATE POLICY "instances_update_admin_or_assignee" ON public.document_instances
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      public.is_owner(auth.uid())
      OR public.has_role(auth.uid(), 'payroll_admin'::app_role)
      OR created_by = auth.uid()
      OR assigned_to_user = auth.uid()
    )
  )
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "instances_delete_owner" ON public.document_instances
  FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.is_owner(auth.uid()));

CREATE TRIGGER update_document_instances_updated_at
  BEFORE UPDATE ON public.document_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_doc_instances_org_status ON public.document_instances(org_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_instances_assigned ON public.document_instances(assigned_to_user);
CREATE INDEX IF NOT EXISTS idx_doc_instances_driver ON public.document_instances(driver_id);

-- 4. document_signatures
CREATE TABLE IF NOT EXISTS public.document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  instance_id uuid NOT NULL REFERENCES public.document_instances(id) ON DELETE CASCADE,
  signer_id uuid NOT NULL,
  role_label text NOT NULL,
  step_index integer NOT NULL,
  signature_data_url text NOT NULL,
  ip_address text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, step_index)
);

GRANT SELECT, INSERT ON public.document_signatures TO authenticated;
GRANT ALL ON public.document_signatures TO service_role;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signatures_select_org" ON public.document_signatures
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "signatures_insert_self" ON public.document_signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    signer_id = auth.uid()
    AND org_id = public.get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.document_instances di
      WHERE di.id = instance_id
        AND di.org_id = org_id
        AND di.status = 'pending_signatures'
        AND di.current_step = step_index
    )
  );

CREATE POLICY "signatures_delete_owner" ON public.document_signatures
  FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.is_owner(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_doc_signatures_instance ON public.document_signatures(instance_id);
CREATE INDEX IF NOT EXISTS idx_doc_signatures_signer ON public.document_signatures(signer_id);

-- 5. Trigger to advance instance on signature
CREATE OR REPLACE FUNCTION public.advance_document_instance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inst public.document_instances%ROWTYPE;
  _total int;
  _next_role text;
  _next_user uuid;
BEGIN
  SELECT * INTO _inst FROM public.document_instances WHERE id = NEW.instance_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  _total := COALESCE(array_length(_inst.signatory_roles, 1), 0);

  IF NEW.step_index + 1 >= _total THEN
    UPDATE public.document_instances
      SET status = 'completed',
          current_step = _total,
          completed_at = now(),
          updated_at = now()
      WHERE id = NEW.instance_id;
  ELSE
    _next_role := _inst.signatory_roles[NEW.step_index + 2]; -- pg arrays are 1-indexed

    -- If next role is driver and instance is tied to a driver, notify them.
    IF _next_role = 'driver' AND _inst.driver_id IS NOT NULL THEN
      SELECT user_id INTO _next_user FROM public.drivers WHERE id = _inst.driver_id;
      IF _next_user IS NOT NULL THEN
        INSERT INTO public.driver_notifications (org_id, driver_id, type, title, message, action_url)
        VALUES (
          _inst.org_id, _inst.driver_id, 'document_signature_required',
          'Signature required: ' || _inst.title,
          'A document is waiting for your signature.',
          '/documents/signing/' || _inst.id::text
        );
      END IF;
    END IF;

    UPDATE public.document_instances
      SET current_step = NEW.step_index + 1,
          assigned_to_user = _next_user,
          updated_at = now()
      WHERE id = NEW.instance_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_document_instance ON public.document_signatures;
CREATE TRIGGER trg_advance_document_instance
  AFTER INSERT ON public.document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.advance_document_instance();
