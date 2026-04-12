-- Drop and recreate document_type check to include carrier packet types
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_document_type_check
  CHECK (document_type = ANY (ARRAY[
    'BOL', 'POD', 'Rate Confirmation', 'Statement', 'Receipt', 'Invoice',
    'License', 'Insurance', 'Inspection', 'Other',
    'W-9', 'MC Authority', 'COI', 'NOA'
  ]));

-- Drop and recreate related_type check to include carrier_packet
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_related_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_related_type_check
  CHECK ((related_type IS NULL) OR (related_type = ANY (ARRAY[
    'general', 'load', 'truck', 'driver', 'maintenance', 'payroll', 'carrier_packet'
  ])));