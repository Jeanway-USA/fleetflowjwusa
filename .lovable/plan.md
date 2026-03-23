

## Plan: Store POD Data Directly on Fleet Loads

### Problem
The POD tab queries the `documents` table for signature and Transflo link records, but those records are invisible due to RLS issues (missing `org_id` on insert). Instead of fighting the documents table, we'll store POD data directly on the `fleet_loads` row where it belongs.

### Solution
Add two columns to `fleet_loads` — `pod_signature_path` and `pod_transflo_link` — and save them during delivery confirmation. The POD viewer reads from the load itself instead of querying documents.

### Database Migration
```sql
ALTER TABLE fleet_loads
  ADD COLUMN pod_signature_path text,
  ADD COLUMN pod_transflo_link text;
```

Backfill from existing document records:
```sql
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
```

### File Changes

| File | Change |
|------|--------|
| `src/components/driver/ProofOfDeliveryDialog.tsx` | Save `pod_signature_path` and `pod_transflo_link` on the fleet_loads UPDATE (already updating the load to "delivered") |
| `src/components/loads/PODViewer.tsx` | Accept load data as props instead of querying documents. Show signature via `SignedImage` using `pod_signature_path`, show Transflo link from `pod_transflo_link` |
| `src/pages/FleetLoads.tsx` | Pass the load's `pod_signature_path` and `pod_transflo_link` to PODViewer |
| `src/components/executive/MorningBriefingWidget.tsx` | Check `pod_signature_path IS NULL AND pod_transflo_link IS NULL` instead of querying documents table |
| `src/components/executive/BriefingLoadsDialog.tsx` | Same — filter missing PODs by checking the load columns directly |

