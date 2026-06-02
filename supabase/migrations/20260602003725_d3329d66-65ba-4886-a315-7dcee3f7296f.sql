ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS hide_promotions boolean NOT NULL DEFAULT false;