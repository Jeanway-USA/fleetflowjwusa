CREATE OR REPLACE FUNCTION public.notify_load_status_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    'https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/email-load-status',
    jsonb_build_object('record', row_to_json(NEW)::jsonb),
    '{}'::jsonb,
    ('{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('supabase.service_role_key', true) || '"}')::jsonb
  );
  RETURN NEW;
END;
$$;