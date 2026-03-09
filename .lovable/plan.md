

## Fix: `notify_load_status_email` trigger function

**Root Cause**: The migration used `extensions.http_post(url := ..., body := ..., headers := ...)` but `pg_net` exposes the function as `net.http_post` with positional parameters.

### Database Migration

Replace the trigger function body to use `net.http_post` with the correct signature:

```sql
CREATE OR REPLACE FUNCTION public.notify_load_status_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    'https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/email-load-status',
    jsonb_build_object('record', row_to_json(NEW)::jsonb)::text,
    '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('supabase.service_role_key', true) || '"}'::jsonb
  );
  RETURN NEW;
END;
$$;
```

Key changes:
- `extensions.http_post` → `net.http_post`
- Named parameters → positional parameters
- `body` passed as `text` (second arg), headers as `jsonb` (third arg)
- `app.settings.service_role_key` → `supabase.service_role_key` (correct setting name in hosted Supabase)

### Files
| File | Action |
|------|--------|
| DB migration | Replace trigger function with correct `net.http_post` call |

No other changes needed.

