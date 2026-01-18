-- Drop the existing check constraint
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_document_type_check;

-- Add updated check constraint with all document types
ALTER TABLE public.documents ADD CONSTRAINT documents_document_type_check 
CHECK (document_type IN ('BOL', 'POD', 'Receipt', 'Invoice', 'License', 'Registration', 'Insurance', 'Inspection', 'Title', 'Medical Card', 'Drug Test', 'Training Certificate', 'Contract', 'Work Order', 'Warranty', 'Other'));