
-- Add screenshot_url column to user_feedback
ALTER TABLE public.user_feedback ADD COLUMN screenshot_url text;

-- Create beta_feedback storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('beta-feedback', 'beta-feedback', false);

-- Allow authenticated users to upload to beta-feedback bucket
CREATE POLICY "Authenticated users can upload feedback screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'beta-feedback');

-- Allow authenticated users to read their own uploads
CREATE POLICY "Authenticated users can read feedback screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'beta-feedback');
