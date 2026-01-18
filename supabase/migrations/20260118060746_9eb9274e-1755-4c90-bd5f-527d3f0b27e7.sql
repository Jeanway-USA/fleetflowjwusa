-- Add HAZMAT expiration field
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS hazmat_expiry date;