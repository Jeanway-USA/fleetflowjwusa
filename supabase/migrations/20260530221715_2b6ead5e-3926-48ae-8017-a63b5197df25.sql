-- Add onboarding tracking flags to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS requires_onboarding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Backfill: existing drivers who have already signed at least one document are considered onboarded.
UPDATE public.profiles p
SET onboarding_completed = true
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id AND ur.role = 'driver'
)
AND EXISTS (
  SELECT 1 FROM public.drivers d
  JOIN public.driver_signed_documents dsd ON dsd.driver_id = d.id
  WHERE d.user_id = p.user_id
);

-- Backfill: existing drivers without signed docs need onboarding.
UPDATE public.profiles p
SET requires_onboarding = true
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id AND ur.role = 'driver'
)
AND p.onboarding_completed = false;

-- Update handle_new_user trigger (if it exists) to copy requires_onboarding from raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, email, requires_onboarding)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'requires_onboarding')::boolean, false)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET requires_onboarding = EXCLUDED.requires_onboarding
    WHERE public.profiles.requires_onboarding = false
      AND EXCLUDED.requires_onboarding = true;
  RETURN NEW;
END;
$$;