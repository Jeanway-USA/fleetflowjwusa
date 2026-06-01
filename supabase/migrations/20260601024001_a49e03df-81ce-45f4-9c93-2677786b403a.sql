
-- Fix 1: Restrict access to Stripe billing identifiers on organizations
-- Non-owners (any authenticated org member) should not see Stripe IDs.
-- Edge functions use service_role and remain unaffected.
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organizations FROM authenticated;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organizations FROM anon;

-- Fix 2: Defense-in-depth on DVIR storage SELECT policies.
-- Add explicit path[2] = caller's org_id check in addition to existing
-- storage_user_same_org() org-membership check.
DROP POLICY IF EXISTS "Owners and safety can view org DVIR photos" ON storage.objects;
CREATE POLICY "Owners and safety can view org DVIR photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'dvir-photos'
  AND storage_user_same_org((storage.foldername(name))[1])
  AND (storage.foldername(name))[2] = (public.get_user_org_id(auth.uid()))::text
  AND (public.is_owner(auth.uid()) OR public.has_safety_access(auth.uid()))
);

DROP POLICY IF EXISTS "Owners and safety can view org DVIR signatures" ON storage.objects;
CREATE POLICY "Owners and safety can view org DVIR signatures"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'dvir-signatures'
  AND storage_user_same_org((storage.foldername(name))[1])
  AND (storage.foldername(name))[2] = (public.get_user_org_id(auth.uid()))::text
  AND (public.is_owner(auth.uid()) OR public.has_safety_access(auth.uid()))
);
