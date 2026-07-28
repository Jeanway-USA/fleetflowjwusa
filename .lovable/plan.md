## Problem

Generating a W-2 from the Tax Hub fails with `new row violates row-level security policy`. The failure is on the **storage upload**, not the database row.

The storage policies on the `tax-documents` bucket require the **first folder in the path to be the driver's ID**:

```
(storage.foldername(name))[1] = drivers.id  AND drivers.org_id = get_user_org_id(auth.uid())
```

But `src/pages/admin/TaxHub.tsx` uploads to an **org-first** path:

- W-2: `${orgId}/${year}/w2/${driverId}.pdf` (line ~402)
- 1099: `${orgId}/${year}/1099/${driverId}.pdf` (line ~568)

Since folder[1] is the org ID, no matching driver row exists and the insert is rejected. The existing driver-side uploader (`src/hooks/useDriverTaxDocuments.ts`) already uses the correct `${driverId}/${taxYear}/...` shape, which is why that path works.

## Fix

In `src/pages/admin/TaxHub.tsx`, change both generated document paths to be driver-first so they satisfy the bucket policy and stay consistent with the driver uploader:

- W-2 → `${driverId}/${year}/w2.pdf`
- 1099-NEC → `${driverId}/${year}/1099_nec.pdf`

Apply the same change in the "Generate All W-2s" bulk mutation if it builds its own path.

Notes:
- Uploads already use `upsert: true`, so regenerating overwrites cleanly.
- The `tax_documents` upsert keeps `onConflict: 'driver_id,tax_year,file_path'`, which matches the existing unique index; with a stable per-year path, regenerating updates the same row instead of creating duplicates.
- The `tax_documents` insert policy itself is fine (admin + same-org driver), so no migration is needed.

## Verification

From the Tax Hub W-2 tab, generate a W-2 for a driver: the PDF should download, a success toast should appear, and no RLS error. Then confirm a `tax_documents` row exists with the new driver-first `file_path`, and repeat for the 1099 tab.
