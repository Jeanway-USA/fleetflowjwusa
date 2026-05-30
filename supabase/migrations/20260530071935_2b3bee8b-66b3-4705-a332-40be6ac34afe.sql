ALTER TABLE public.changelog DROP CONSTRAINT IF EXISTS changelog_created_by_fkey;
ALTER TABLE public.changelog ADD CONSTRAINT changelog_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;