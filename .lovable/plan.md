## Cause
The `documents` INSERT policy `Users can upload their own documents` has WITH CHECK:

```
uploaded_by = auth.uid()
AND org_id = get_user_org_id(auth.uid())
AND (…related_type checks…)
```

`DocumentScanButton` (and the offline-queue drain in `useOfflineDocumentQueue`) inserts without `org_id`, so it's NULL and the check fails → "new row violates row-level security policy for table 'documents'".

This matches the project's standard multi-tenant rule (`org_id` on every public table) but the documents table never got a default-org trigger like `trucks`, `driver_notifications`, etc.

## Fix — single DB migration

Add a `BEFORE INSERT` trigger on `public.documents` that defaults `org_id` from `get_user_org_id(auth.uid())` when the client omits it. Mirrors `set_trucks_org_id`, `set_driver_notification_org_id`, etc.

```sql
CREATE OR REPLACE FUNCTION public.set_documents_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_documents_org_id_trg ON public.documents;
CREATE TRIGGER set_documents_org_id_trg
BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_documents_org_id();
```

## Why this is the right shape
- **No client code change** → fixes both the live `DocumentScanButton` upload and any document already sitting in the IndexedDB offline queue when the user reconnects.
- **Trigger-based default**, not a column DEFAULT, so `auth.uid()` is evaluated per insert (column defaults can't reference auth).
- **Doesn't widen security**: the trigger only fills NULL; the RLS check still validates `org_id = get_user_org_id(auth.uid())` and `uploaded_by = auth.uid()`.
- **Backwards compatible**: existing inserts that already supply `org_id` (admin/Operations paths) are untouched.

## Out of scope
- No change to `documents` policies — they're correct, the inserts just lacked org context.
- No change to `DocumentScanButton.tsx`, `useOfflineDocumentQueue.ts`, or the storage bucket.
- Not retro-filling org on any historical rows (none have been created in this broken state).

## Verification
After the migration runs, in the driver dashboard:
1. Scan Doc → Take Photo → Quality Gate → Upload → expect "Document uploaded successfully" and a new row in `documents` with `org_id` populated.
2. With the network throttled to offline → queue + reconnect → expect the green "All documents uploaded" chip and the same row.
