
-- Add branding columns
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '45 80% 45%',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text;

-- Create branding assets bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding-assets', 'branding-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: org members can read their branding assets
CREATE POLICY "Org members can view branding assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'branding-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

-- Storage RLS: owners can upload branding assets
CREATE POLICY "Owners can upload branding assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'branding-assets'
    AND is_owner(auth.uid())
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

-- Storage RLS: owners can manage branding assets
CREATE POLICY "Owners can manage branding assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding-assets'
    AND is_owner(auth.uid())
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

-- Storage RLS: owners can update branding assets
CREATE POLICY "Owners can update branding assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding-assets'
    AND is_owner(auth.uid())
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );
