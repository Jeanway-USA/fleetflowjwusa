-- Add new fields for DOT Medical Card, Endorsements, and TWIC Card
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS medical_card_expiry date,
ADD COLUMN IF NOT EXISTS endorsements text[],
ADD COLUMN IF NOT EXISTS has_twic boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS twic_expiry date,
ADD COLUMN IF NOT EXISTS avatar_url text;