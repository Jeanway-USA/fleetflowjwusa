
-- 1. Create internal_config table (RLS enabled, no policies = inaccessible to users)
CREATE TABLE IF NOT EXISTS public.internal_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
-- No RLS policies: only SECURITY DEFINER functions can read this table

-- 2. Insert a random webhook secret
INSERT INTO public.internal_config (key, value)
VALUES ('email_webhook_secret', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- 3. Replace the trigger function to use internal_config instead of current_setting
CREATE OR REPLACE FUNCTION public.notify_load_status_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _secret TEXT;
BEGIN
  SELECT value INTO _secret FROM public.internal_config WHERE key = 'email_webhook_secret';

  PERFORM net.http_post(
    'https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/email-load-status',
    jsonb_build_object('record', row_to_json(NEW)::jsonb),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    )
  );
  RETURN NEW;
END;
$$;
