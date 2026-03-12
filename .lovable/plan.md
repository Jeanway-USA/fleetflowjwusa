

## Plan: Fix Service Role Key Exposure

### Problem
The `notify_load_status_email` trigger uses `current_setting('supabase.service_role_key')` to authenticate calls to the edge function. Any authenticated user can read this setting and extract the service role key.

### Solution
Replace the service role key with a dedicated webhook secret (`EMAIL_WEBHOOK_SECRET`) that is only accessible to the edge function via `Deno.env.get()`.

### Changes

**1. Database Migration** — Replace trigger function

```sql
CREATE OR REPLACE FUNCTION public.notify_load_status_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    'https://iwivgqsihxicyptaoewm.supabase.co/functions/v1/email-load-status',
    jsonb_build_object('record', row_to_json(NEW)::jsonb),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', current_setting('app.settings.email_webhook_secret', true)
    )
  );
  RETURN NEW;
END;
$$;
```

Wait — this has the same problem (readable via `current_setting`). The correct approach: **hardcode nothing in the trigger**. Instead, use Supabase's built-in `SUPABASE_SERVICE_ROLE_KEY` env var but validate a separate secret header in the edge function.

Actually, the cleanest fix:
- The trigger sends with **no auth header** (remove the Authorization header entirely)
- The edge function validates using `EMAIL_WEBHOOK_SECRET` passed as a custom header
- But triggers can't read Deno env vars...

The proper pattern: Store the webhook secret as a Postgres setting via the migration (using `ALTER DATABASE` is not allowed), so instead we use **Supabase Vault** or simply set it in the trigger body from a known constant.

**Revised approach — simplest and secure:**

The trigger will send a custom `x-webhook-secret` header. The value will be set via a Postgres config parameter that is **only readable by the trigger's SECURITY DEFINER context**. But actually any user can call `current_setting()`.

**Final correct approach:**

1. Remove auth from the trigger entirely — send no secret
2. In the edge function, validate the request by checking that the payload matches a real `load_status_logs` record (verify the data server-side using the service role key that the edge function already has via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`)
3. Add the `EMAIL_WEBHOOK_SECRET` as a shared secret: set it in Supabase secrets, and also set it in the trigger via a migration using `ALTER ROLE authenticated SET app.settings.email_webhook_secret = '...'` — no, that's also readable.

**Correct final approach — industry standard:**

1. Store `EMAIL_WEBHOOK_SECRET` as a Supabase edge function secret (already being added)
2. In the trigger, send the secret as a header — but instead of `current_setting`, use the **Supabase Vault** extension to store it securely:

```sql
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_webhook_secret'
```

Vault secrets are **not readable** by authenticated users (only by SECURITY DEFINER functions).

### Final Plan

**1. Database Migration:**
- Insert the webhook secret into Supabase Vault
- Replace `notify_load_status_email` to read from vault instead of `current_setting`

```sql
-- Store webhook secret in vault (only accessible via SECURITY DEFINER)
INSERT INTO vault.secrets (name, secret) 
VALUES ('email_webhook_secret', 'PLACEHOLDER')
ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;
```

Wait — we can't modify the `vault` schema per the guidelines. Let me reconsider.

**Simplest secure approach:**
1. The trigger sends NO authentication header at all
2. The edge function checks a custom `x-webhook-secret` header against `Deno.env.get('EMAIL_WEBHOOK_SECRET')`
3. The trigger includes the secret... but how does the trigger know the secret?

The real answer: **Use `pg_net` with the service role key that's already available as a Postgres setting, but restrict who can read it.** Actually, `supabase.service_role_key` is a built-in Supabase setting that is already set — the issue is that anyone can read it.

**The actual fix the scan recommends:**
> Use a dedicated webhook secret (e.g., stored in Supabase Vault) instead of the service role key.

Since we can't use vault (reserved schema), the best approach is:

1. **Remove the Authorization header from the trigger** — don't send any secret from the DB
2. **In the edge function**, instead of validating the caller by token, validate that the request comes from within the Supabase infrastructure by:
   - Checking the `x-webhook-secret` header against `Deno.env.get('EMAIL_WEBHOOK_SECRET')`
   - The trigger sets this header using a value stored in a **custom table** only readable by SECURITY DEFINER functions

Actually the simplest: just remove auth from trigger, and in the edge function validate using the webhook secret from a custom header. The trigger gets the secret from a restricted table.

### Simplified Final Plan

**Step 1: Add `EMAIL_WEBHOOK_SECRET` as a Supabase secret** (user provides value)

**Step 2: Create a small config table** to store the webhook secret, with RLS blocking all access (only SECURITY DEFINER trigger can read it):

```sql
CREATE TABLE IF NOT EXISTS internal_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE internal_config ENABLE ROW LEVEL SECURITY;
-- No policies = nobody can read via RLS
INSERT INTO internal_config (key, value) VALUES ('email_webhook_secret', '<the-secret>');
```

**Step 3: Update trigger** to read from `internal_config` instead of `current_setting`:
```sql
CREATE OR REPLACE FUNCTION notify_load_status_email() ...
DECLARE
  _secret TEXT;
BEGIN
  SELECT value INTO _secret FROM internal_config WHERE key = 'email_webhook_secret';
  PERFORM net.http_post(..., 
    jsonb_build_object('Content-Type','application/json','x-webhook-secret', _secret)
  );
END;
```
Since the trigger is SECURITY DEFINER, it bypasses RLS and can read the table. Regular users cannot.

**Step 4: Update edge function** to validate `x-webhook-secret` header against `Deno.env.get('EMAIL_WEBHOOK_SECRET')` instead of the service role key.

### Files Changed
1. New SQL migration (internal_config table + trigger replacement)
2. `supabase/functions/email-load-status/index.ts` — change auth check from service role key to webhook secret header

### Problem with syncing the secret
The secret value must match between `internal_config` table and the Supabase edge function secret. The user needs to:
1. Generate a random string
2. Enter it as the `EMAIL_WEBHOOK_SECRET` when prompted
3. The migration will insert that same value into `internal_config`

But we can't know the value at migration time... unless we generate it IN the migration and the user copies it to the secret.

**Better: Generate in migration, output for user to set as secret.**

Actually simplest: generate the secret in the migration using `gen_random_uuid()`, store in `internal_config`, and have the user copy that value to set as the edge function secret. But that's clunky.

**Best approach: Use gen_random_uuid() in migration, and read it from the DB in the edge function too.**

Wait — the edge function can read from the DB using the service role key (which it already has via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`). So:

1. Migration creates `internal_config` with a random secret
2. Trigger sends that secret as `x-webhook-secret` header  
3. Edge function reads the secret from `internal_config` using service role client and compares

This way no external secret is needed at all! The secret lives only in the DB (inaccessible via RLS) and is verified by the edge function reading from the same table.

### Revised Final Plan (No External Secret Needed)

**1. SQL Migration:**
- Create `internal_config` table with RLS enabled and no policies
- Insert a random webhook secret: `gen_random_uuid()::text`
- Replace `notify_load_status_email` trigger to read from `internal_config` and send as `x-webhook-secret` header (no Authorization header)

**2. Edge Function Update (`email-load-status/index.ts`):**
- Remove the service role key comparison auth check
- Read the webhook secret from `internal_config` using the admin client
- Compare against the `x-webhook-secret` request header

This eliminates the need for the user to provide any secret value.

### Summary
- 1 migration file (create table, insert secret, replace trigger)
- 1 edge function file update
- No user-provided secrets needed
- Service role key no longer exposed in DB triggers
