-- Drop the existing overly permissive SELECT policies
DROP POLICY IF EXISTS "Authenticated users can view dvir photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view dvir signatures" ON storage.objects;

-- Create a helper function to check if a storage path's owner belongs to the same org
CREATE OR REPLACE FUNCTION public.storage_user_same_org(folder_owner_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p1
    JOIN public.profiles p2 ON p1.org_id = p2.org_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = folder_owner_id::uuid
  )
$$;

-- Scoped SELECT policy for dvir-photos: only same-org users can read
CREATE POLICY "Org members can view dvir photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'dvir-photos'
  AND public.storage_user_same_org((storage.foldername(name))[1])
);

-- Scoped SELECT policy for dvir-signatures: only same-org users can read
CREATE POLICY "Org members can view dvir signatures"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'dvir-signatures'
  AND public.storage_user_same_org((storage.foldername(name))[1])
);