CREATE OR REPLACE FUNCTION public.log_document_template_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_details jsonb;
  v_record_id uuid;
  v_org_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'template_created';
    v_record_id := NEW.id;
    v_org_id := NEW.org_id;
    v_details := jsonb_build_object(
      'document_type', NEW.document_type,
      'name', NEW.name,
      'is_active', NEW.is_active,
      'version', NEW.version
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := CASE
      WHEN OLD.is_active IS DISTINCT FROM NEW.is_active
        THEN CASE WHEN NEW.is_active THEN 'template_activated' ELSE 'template_deactivated' END
      ELSE 'template_updated'
    END;
    v_record_id := NEW.id;
    v_org_id := NEW.org_id;
    v_details := jsonb_build_object(
      'changed', jsonb_strip_nulls(jsonb_build_object(
        'document_type', CASE WHEN OLD.document_type IS DISTINCT FROM NEW.document_type
          THEN jsonb_build_object('from', OLD.document_type, 'to', NEW.document_type) END,
        'name', CASE WHEN OLD.name IS DISTINCT FROM NEW.name
          THEN jsonb_build_object('from', OLD.name, 'to', NEW.name) END,
        'is_active', CASE WHEN OLD.is_active IS DISTINCT FROM NEW.is_active
          THEN jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active) END,
        'content_changed', CASE WHEN OLD.content IS DISTINCT FROM NEW.content
          THEN to_jsonb(true) END
      ))
    );
  ELSE
    v_action := 'template_deleted';
    v_record_id := OLD.id;
    v_org_id := OLD.org_id;
    v_details := jsonb_build_object(
      'document_type', OLD.document_type,
      'name', OLD.name
    );
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, org_id)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    v_action,
    'document_template',
    v_record_id,
    v_details,
    v_org_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_document_templates ON public.document_templates;
CREATE TRIGGER trg_audit_document_templates
AFTER INSERT OR UPDATE OR DELETE ON public.document_templates
FOR EACH ROW EXECUTE FUNCTION public.log_document_template_change();