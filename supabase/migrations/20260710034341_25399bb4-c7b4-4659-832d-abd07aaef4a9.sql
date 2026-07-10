-- Remove overly permissive org-wide Realtime Authorization policies on realtime.messages.
-- These allowed any authenticated org member to subscribe to broadcast/private channels
-- scoped by org_id topic and read every message in the org, and to forge broadcasts.
-- Direct table access to public.messages continues to be governed by its own
-- participant-scoped RLS policies, which is what our postgres_changes subscriptions use.
DROP POLICY IF EXISTS "Org-scoped realtime read" ON realtime.messages;
DROP POLICY IF EXISTS "Org-scoped realtime write" ON realtime.messages;