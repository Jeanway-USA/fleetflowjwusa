
-- 1. Revoke client SELECT on driver_settings.landstar_password
REVOKE SELECT (landstar_password) ON public.driver_settings FROM authenticated, anon;

-- 5. Revoke client SELECT on org_storage_config.encrypted_credentials
REVOKE SELECT (encrypted_credentials) ON public.org_storage_config FROM authenticated, anon;

-- 3. Revoke client SELECT on organizations Stripe IDs (server-side only)
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organizations FROM authenticated, anon;

-- 2. Tighten profiles INSERT policy: signup must not self-assign org_id
DROP POLICY IF EXISTS "Profiles can be created on signup" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile on signup"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND org_id IS NULL
);

-- 4. Beta feedback bucket: allow users to delete and update their own files
CREATE POLICY "Users can delete their own beta feedback uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'beta_feedback'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own beta feedback uploads"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'beta_feedback'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'beta_feedback'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
