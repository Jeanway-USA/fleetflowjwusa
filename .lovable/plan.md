## Add Direct Messaging Schema

Create a `messages` table to support real-time 1:1 direct messaging between users in the same organization, with RLS scoped so users only see messages they sent or received.

### Schema

New table `public.messages`:
- `id` uuid PK, default `gen_random_uuid()`
- `sender_id` uuid NOT NULL (references `auth.users.id`)
- `receiver_id` uuid NOT NULL (references `auth.users.id`)
- `org_id` uuid NOT NULL — required for multi-tenant isolation (matches Core memory rule: all core tables carry `org_id`)
- `content` text NOT NULL, with a CHECK to disallow empty strings
- `is_read` boolean NOT NULL default `false`
- `created_at` timestamptz NOT NULL default `now()`

Indexes:
- `(receiver_id, is_read)` for unread counts
- `(sender_id, receiver_id, created_at desc)` for conversation threads
- `(org_id)`

### Grants & RLS

Grants (auth-only table, no anon):
```
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
```

Enable RLS, then policies (all scoped to `authenticated`):
- **SELECT**: `auth.uid() IN (sender_id, receiver_id)`
- **INSERT** (WITH CHECK):
  - `sender_id = auth.uid()`
  - `org_id = public.get_user_org_id(auth.uid())`
  - receiver must belong to same org (subquery against `profiles`)
  - `sender_id <> receiver_id`
- **UPDATE**: only the receiver may flip `is_read` → USING `receiver_id = auth.uid()`; a BEFORE UPDATE trigger blocks changes to any column other than `is_read` (defense in depth so receivers cannot rewrite content/sender/etc.)
- **DELETE**: `sender_id = auth.uid()` (senders can retract; receivers cannot delete)

### Org auto-fill trigger

`set_messages_org_id()` BEFORE INSERT — if `org_id` is NULL, populate from `get_user_org_id(auth.uid())`. Mirrors existing `set_trucks_org_id` / `set_driver_request_org_id` patterns.

### Realtime

- `ALTER TABLE public.messages REPLICA IDENTITY FULL;`
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;`

### Types

`src/integrations/supabase/types.ts` regenerates automatically after the migration runs — no manual edits.

### Out of scope for this task

No UI, no edge function, no notifications wiring. This plan only delivers the schema, RLS, realtime publication, and types refresh.