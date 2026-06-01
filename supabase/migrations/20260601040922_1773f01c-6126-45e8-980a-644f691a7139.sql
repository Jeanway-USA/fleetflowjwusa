
-- 1) Restrict stripe identifier columns on organizations to service_role only
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organizations FROM authenticated, anon;

-- 2) Remove weaker overlapping DVIR signature upload policy that lacks the org_id path segment check
DROP POLICY IF EXISTS "Drivers can upload org-scoped signatures" ON storage.objects;

-- 3) Replace substring-based exclusion of direct deposit files with structured path segment check
DROP POLICY IF EXISTS "Safety can read non-banking signed documents" ON storage.objects;
CREATE POLICY "Safety can read non-banking signed documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signed-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text
  AND has_role(auth.uid(), 'safety'::app_role)
  AND COALESCE((storage.foldername(name))[3], '') <> 'direct_deposit'
);
