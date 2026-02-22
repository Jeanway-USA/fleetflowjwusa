
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE public.documents ADD CONSTRAINT documents_document_type_check CHECK (document_type IN ('BOL', 'POD', 'Rate Confirmation', 'Statement', 'Receipt', 'Invoice', 'License', 'Insurance', 'Inspection', 'Other'));
