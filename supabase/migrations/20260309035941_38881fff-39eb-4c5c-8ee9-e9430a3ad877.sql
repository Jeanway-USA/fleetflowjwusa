-- Ensure screenshot_url column exists on user_feedback
ALTER TABLE public.user_feedback ADD COLUMN IF NOT EXISTS screenshot_url text;

-- Ensure requested bucket exists with exact name beta_feedback (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('beta_feedback', 'beta_feedback', false)
ON CONFLICT (id) DO NOTHING;

-- Tighten policies for per-user folder access in beta_feedback
DROP POLICY IF EXISTS "Authenticated users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own beta feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own beta feedback screenshots" ON storage.objects;

CREATE POLICY "Users can upload own beta feedback screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'beta_feedback'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read own beta feedback screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'beta_feedback'
  AND auth.uid()::text = (storage.foldername(name))[1]
);