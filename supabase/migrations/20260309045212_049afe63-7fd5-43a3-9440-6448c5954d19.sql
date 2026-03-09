
-- Enable the pg_net extension if not already
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.notify_load_status_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/email-load-status',
    body := jsonb_build_object(
      'record', row_to_json(NEW)::jsonb
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  RETURN NEW;
END;
$$;

-- Attach trigger to load_status_logs
CREATE TRIGGER trigger_email_on_status_change
  AFTER INSERT ON public.load_status_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_load_status_email();
