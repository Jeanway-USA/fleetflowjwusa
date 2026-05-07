
-- 1. Fix documents storage bucket: standardize all policies to org_id prefix
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

CREATE POLICY "Org members can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text)
WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text);

CREATE POLICY "Org members can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = (get_user_org_id(auth.uid()))::text);

-- 2. Restrict manufacturer_pm_profiles mutations to super admins (global reference data)
DROP POLICY IF EXISTS "Owner can manage manufacturer profiles" ON public.manufacturer_pm_profiles;

CREATE POLICY "Super admins can manage manufacturer profiles"
ON public.manufacturer_pm_profiles FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Allow all authenticated users to read manufacturer profiles (reference data)
CREATE POLICY "Authenticated can view manufacturer profiles"
ON public.manufacturer_pm_profiles FOR SELECT
TO authenticated
USING (true);

-- 3. user_feedback: allow users to read their own submissions
CREATE POLICY "Users can view own feedback"
ON public.user_feedback FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
