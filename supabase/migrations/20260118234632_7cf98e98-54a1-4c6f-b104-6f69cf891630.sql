-- Create storage buckets for DVIR photos and signatures
INSERT INTO storage.buckets (id, name, public) 
VALUES ('dvir-photos', 'dvir-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('dvir-signatures', 'dvir-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for dvir-photos bucket
CREATE POLICY "Drivers can upload their own DVIR photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'dvir-photos' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Anyone can view DVIR photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'dvir-photos');

CREATE POLICY "Drivers can delete their own DVIR photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'dvir-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for dvir-signatures bucket
CREATE POLICY "Drivers can upload their own signatures"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'dvir-signatures' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Anyone can view DVIR signatures"
ON storage.objects FOR SELECT
USING (bucket_id = 'dvir-signatures');

-- Add signature_url column to driver_inspections
ALTER TABLE public.driver_inspections 
ADD COLUMN IF NOT EXISTS signature_url text;

-- Create table for inspection photos (multiple photos per inspection)
CREATE TABLE public.inspection_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id uuid NOT NULL REFERENCES public.driver_inspections(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on inspection_photos
ALTER TABLE public.inspection_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies for inspection_photos
CREATE POLICY "Drivers can insert photos for their inspections"
ON public.inspection_photos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.driver_inspections di
    WHERE di.id = inspection_id 
    AND di.driver_id = get_driver_id_for_user(auth.uid())
  )
);

CREATE POLICY "Drivers can view photos for their inspections"
ON public.inspection_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.driver_inspections di
    WHERE di.id = inspection_id 
    AND di.driver_id = get_driver_id_for_user(auth.uid())
  )
);

CREATE POLICY "Admin roles can view all inspection photos"
ON public.inspection_photos FOR SELECT
USING (has_admin_access(auth.uid()));

CREATE POLICY "Owner safety can manage inspection photos"
ON public.inspection_photos FOR ALL
USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'safety'::app_role));