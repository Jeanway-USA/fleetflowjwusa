ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'shared'
  CHECK (applies_to IN ('shared','w2','1099'));

UPDATE public.document_templates
  SET applies_to = 'w2'
  WHERE document_type = 'direct_deposit' AND applies_to = 'shared';