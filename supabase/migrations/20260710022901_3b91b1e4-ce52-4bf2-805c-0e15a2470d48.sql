CREATE OR REPLACE FUNCTION public.advance_document_instance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    _next_role := _inst.signatory_roles[NEW.step_index + 2];

    IF _next_role = 'driver' AND _inst.driver_id IS NOT NULL THEN
      SELECT user_id INTO _next_user FROM public.drivers WHERE id = _inst.driver_id;
      IF _next_user IS NOT NULL THEN
        INSERT INTO public.driver_notifications (org_id, driver_id, notification_type, title, message, related_id)
        VALUES (
          _inst.org_id, _inst.driver_id, 'document_signature_required',
          'Signature required: ' || _inst.title,
          'A document is waiting for your signature.',
          _inst.id
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
$function$;