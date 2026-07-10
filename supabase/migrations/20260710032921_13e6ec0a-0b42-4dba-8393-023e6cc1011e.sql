UPDATE public.document_templates
SET content = regexp_replace(
  content,
  '\{\{\s*(driver_printed_name|driver_title|driver_date_signed|owner_printed_name|owner_title|owner_date_signed|driver_name|signer_name)\s*\}\}',
  '',
  'g'
),
updated_at = now()
WHERE content ~ '\{\{\s*(driver_printed_name|driver_title|driver_date_signed|owner_printed_name|owner_title|owner_date_signed|driver_name|signer_name)\s*\}\}';