-- Let document templates be archived (hidden and switched off) and restored. Nothing is deleted.
-- Run in the Supabase SQL editor (or through Lovable) when the "archive a template" change is merged. Safe to run twice.
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Archived templates are always off, so nobody is asked to sign them.
UPDATE public.document_templates SET is_active = false WHERE archived_at IS NOT NULL AND is_active;
