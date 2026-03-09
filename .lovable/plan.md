

## Create Database Webhook via SQL Migration

Instead of manually configuring a webhook in the Supabase dashboard, we can create a trigger function that automatically calls the `email-load-status` edge function whenever a row is inserted into `load_status_logs`. This uses the `net.http_post` extension (pg_net) which is available in your backend.

### Migration SQL

Create a trigger function on `load_status_logs` that fires on `INSERT` and sends an HTTP POST to the edge function URL with the new row as JSON payload. This includes the service role key in the Authorization header.

```sql
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
```

### Why This Is Better
- No manual dashboard configuration needed
- Deploys automatically with the migration
- Version-controlled alongside the rest of the codebase

### Files
| File | Action |
|------|--------|
| DB migration | Create trigger function + trigger on `load_status_logs` |

No other file changes needed — the edge function already exists and handles the payload format.

