ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_related_type_check;

ALTER TABLE public.documents ADD CONSTRAINT documents_related_type_check
CHECK (
  related_type IS NULL OR related_type IN (
    'general',
    'load',
    'truck',
    'driver',
    'maintenance',
    'payroll'
  )
);