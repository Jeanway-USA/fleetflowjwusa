

## Fix: "invalid input syntax for type json" on load save

**Root Cause**: The `notify_load_status_email` trigger function passes the body as `text` (second arg), but `net.http_post` signature is `(url text, body jsonb, params jsonb, headers jsonb, timeout int)`. The body needs to be `jsonb`, not `text`, and we need to pass an empty `'{}'::jsonb` for the `params` argument (third positional param) before headers.

### Database Migration

```sql
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
```

Key fixes:
- Body stays as `jsonb` (remove `::text` cast)
- Add `'{}'::jsonb` for the `params` argument (3rd positional param)
- Headers move to 4th position

| File | Change |
|------|--------|
| DB migration | Fix `net.http_post` call signature |

