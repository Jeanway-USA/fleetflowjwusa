-- 1) Remove overly-broad driver SELECT policies on CRM tables.
-- Drivers have no CRM UI and should not see contact emails/phones/notes for the whole org.
DROP POLICY IF EXISTS "Drivers can view CRM contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Drivers can view CRM activities" ON public.crm_activities;
DROP POLICY IF EXISTS "Drivers can view CRM contact loads" ON public.crm_contact_loads;

-- 2) Add Realtime Authorization policies on realtime.messages so that
-- authenticated users can only subscribe to channel topics that begin with
-- their own org id. Without this, any signed-in user can subscribe to any
-- channel topic and receive broadcasts intended for other orgs.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org-scoped realtime read" ON realtime.messages;
CREATE POLICY "Org-scoped realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE (public.get_user_org_id(auth.uid())::text || ':%')
  OR realtime.topic() = public.get_user_org_id(auth.uid())::text
);

DROP POLICY IF EXISTS "Org-scoped realtime write" ON realtime.messages;
CREATE POLICY "Org-scoped realtime write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE (public.get_user_org_id(auth.uid())::text || ':%')
  OR realtime.topic() = public.get_user_org_id(auth.uid())::text
);