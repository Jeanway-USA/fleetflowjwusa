ALTER TABLE public.driver_signed_documents ADD COLUMN IF NOT EXISTS attachment_file_path TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS direct_deposit_attachment_url TEXT;