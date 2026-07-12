
-- 1. Recreate the missing trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill profiles for auth users missing one
INSERT INTO public.profiles (user_id, first_name, last_name, email, requires_onboarding)
SELECT
  u.id,
  u.raw_user_meta_data->>'first_name',
  u.raw_user_meta_data->>'last_name',
  u.email,
  COALESCE((u.raw_user_meta_data->>'requires_onboarding')::boolean, false)
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3. Link backfilled profiles to their inviting org (most recent invitation)
UPDATE public.profiles p
SET org_id = inv.org_id
FROM (
  SELECT DISTINCT ON (LOWER(email)) LOWER(email) AS email_lc, org_id
  FROM public.invitations
  WHERE org_id IS NOT NULL
  ORDER BY LOWER(email), created_at DESC
) inv
WHERE p.org_id IS NULL
  AND LOWER(p.email) = inv.email_lc;

-- 4. Safety net: link driver rows to their user_id where the email matches
UPDATE public.drivers d
SET user_id = p.user_id
FROM public.profiles p
WHERE d.user_id IS NULL
  AND d.email IS NOT NULL
  AND p.email IS NOT NULL
  AND LOWER(d.email) = LOWER(p.email)
  AND d.org_id = p.org_id;
