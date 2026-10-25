-- Remove the demo company: switch it off, delete nothing.
-- Run this in the Supabase SQL editor after the "remove demo mode" change is merged. Safe to run twice.
-- Part 1 only reads. Part 2 marks the demo company inactive and blocks the demo sign-in. Every row stays
-- in place, so it can be switched back on (see the undo at the bottom).
-- It never touches a company that has any real user in it: those are listed and skipped.

-- ---------------------------------------------------------------------------------------------------------------
-- Part 1: what is there (read only). Look at this before running part 2.
-- ---------------------------------------------------------------------------------------------------------------
WITH demo_user AS (
  SELECT id FROM auth.users WHERE email = 'demo@fleetflow-tms.com'
),
demo_orgs AS (
  SELECT o.id, o.name, o.is_active, o.created_at
  FROM public.organizations o
  WHERE o.name ILIKE '%demo%'
     OR o.id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id IN (SELECT id FROM demo_user))
)
SELECT
  d.id, d.name, d.is_active, d.created_at,
  (SELECT count(*) FROM public.profiles p WHERE p.org_id = d.id) AS people,
  (SELECT count(*) FROM public.profiles p WHERE p.org_id = d.id AND p.user_id NOT IN (SELECT id FROM demo_user)) AS other_people,
  (SELECT count(*) FROM public.fleet_loads l WHERE l.org_id = d.id) AS loads,
  (SELECT count(*) FROM public.drivers x WHERE x.org_id = d.id) AS drivers,
  (SELECT count(*) FROM public.trucks t WHERE t.org_id = d.id) AS trucks
FROM demo_orgs d
ORDER BY d.created_at;

-- ---------------------------------------------------------------------------------------------------------------
-- Part 2: switch the demo company off. Only companies with no one but the demo user in them.
-- ---------------------------------------------------------------------------------------------------------------
UPDATE public.organizations o
SET is_active = false
WHERE (o.name ILIKE '%demo%'
       OR o.id IN (SELECT p.org_id FROM public.profiles p
                   WHERE p.user_id IN (SELECT id FROM auth.users WHERE email = 'demo@fleetflow-tms.com')))
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.org_id = o.id
      AND p.user_id NOT IN (SELECT id FROM auth.users WHERE email = 'demo@fleetflow-tms.com')
  );

-- Block the demo sign-in (a ban, not a delete).
UPDATE auth.users
SET banned_until = now() + interval '100 years'
WHERE email = 'demo@fleetflow-tms.com';

-- Check: the demo company should now show is_active = false, and the demo user a ban.
SELECT o.id, o.name, o.is_active FROM public.organizations o WHERE o.name ILIKE '%demo%';
SELECT email, banned_until FROM auth.users WHERE email = 'demo@fleetflow-tms.com';

-- ---------------------------------------------------------------------------------------------------------------
-- Undo (only if you ever want the demo company back). Not run by default.
-- ---------------------------------------------------------------------------------------------------------------
-- UPDATE public.organizations SET is_active = true WHERE name ILIKE '%demo%';
-- UPDATE auth.users SET banned_until = NULL WHERE email = 'demo@fleetflow-tms.com';
