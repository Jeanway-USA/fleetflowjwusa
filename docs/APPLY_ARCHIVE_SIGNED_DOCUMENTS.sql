-- Lets signed onboarding documents be archived instead of deleted (Oct 2026). Run once through Lovable. Safe to run again.
-- Archived documents stay in the database and can be restored from the Document review page.
ALTER TABLE public.driver_signed_documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.driver_signed_documents ADD COLUMN IF NOT EXISTS archived_by uuid;
