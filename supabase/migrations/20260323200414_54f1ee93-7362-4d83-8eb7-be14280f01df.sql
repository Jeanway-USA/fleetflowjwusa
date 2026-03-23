
ALTER TABLE fleet_loads
  ADD COLUMN IF NOT EXISTS pod_signature_path text,
  ADD COLUMN IF NOT EXISTS pod_transflo_link text;

-- Backfill from existing document records
UPDATE fleet_loads SET pod_signature_path = d.file_path
FROM documents d
WHERE d.related_id = fleet_loads.id AND d.related_type = 'load'
  AND d.document_type = 'pod_signature'
  AND fleet_loads.pod_signature_path IS NULL;

UPDATE fleet_loads SET pod_transflo_link = d.file_path
FROM documents d
WHERE d.related_id = fleet_loads.id AND d.related_type = 'load'
  AND d.document_type = 'transflo_pod'
  AND fleet_loads.pod_transflo_link IS NULL;
