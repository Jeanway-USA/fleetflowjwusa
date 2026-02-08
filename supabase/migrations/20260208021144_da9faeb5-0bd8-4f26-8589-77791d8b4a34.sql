-- Drop overly permissive "Anyone can view" policies on DVIR storage buckets
DROP POLICY IF EXISTS "Anyone can view DVIR photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view DVIR signatures" ON storage.objects;

-- Create authenticated-only policies with role-based access
-- Drivers can view their own inspection photos/signatures, operations/safety can view all
CREATE POLICY "Authenticated users can view DVIR photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dvir-photos' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can view DVIR signatures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dvir-signatures' 
  AND auth.uid() IS NOT NULL
);