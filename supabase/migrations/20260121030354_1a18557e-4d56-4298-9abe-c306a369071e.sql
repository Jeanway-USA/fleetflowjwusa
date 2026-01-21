-- Fix STORAGE_EXPOSURE: Make storage buckets private to prevent direct URL access
-- This requires authenticated users to access files via signed URLs

-- Make documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- Make dvir-photos bucket private  
UPDATE storage.buckets SET public = false WHERE id = 'dvir-photos';

-- Make dvir-signatures bucket private
UPDATE storage.buckets SET public = false WHERE id = 'dvir-signatures';