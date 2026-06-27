## Goal
Activate the "1099 Tax Statements" card by letting admins/dispatchers upload 1099 PDFs to a driver's profile and letting drivers download their own forms by tax year.

## Task 1 — Backend (Storage + DB)

**Storage bucket** (via tool, not SQL):
- Create private bucket `tax-documents`.
- File path convention: `{driver_user_id}/{tax_year}/{uuid}.pdf` so RLS can match the first folder segment to `auth.uid()`.

**Storage RLS** on `storage.objects` for bucket `tax-documents`:
- `SELECT`: admins/dispatchers in same org (via `has_admin_access(auth.uid())`) OR `auth.uid()::text = (storage.foldername(name))[1]` (driver self).
- `INSERT` / `UPDATE` / `DELETE`: admins/dispatchers only (`has_admin_access`).

**Table `public.tax_documents`** (single migration):
```
id uuid pk default gen_random_uuid()
org_id uuid not null            -- for tenant isolation, set via trigger
driver_id uuid not null         -- references auth.users(id); equals drivers.user_id
tax_year integer not null check (tax_year between 1990 and 2100)
file_path text not null
uploaded_by uuid                -- auth.uid() of admin
created_at timestamptz default now()
unique (driver_id, tax_year, file_path)
```
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_documents TO authenticated;`
- `GRANT ALL ON public.tax_documents TO service_role;`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- Trigger `set_tax_documents_org_id` on insert: sets `org_id = get_user_org_id(auth.uid())` if null, and sets `uploaded_by = auth.uid()`.
- Policies:
  - `SELECT`: `driver_id = auth.uid()` OR (`has_admin_access(auth.uid())` AND `org_id = get_user_org_id(auth.uid())`).
  - `INSERT`: `has_admin_access(auth.uid())` AND `org_id = get_user_org_id(auth.uid())` AND the target `driver_id` belongs to a driver in the same org (sub-select on `public.drivers` where `user_id = driver_id`).
  - `UPDATE` / `DELETE`: admin-only, same-org.
- Index on `(driver_id, tax_year desc)`.

> Note: the user's spec said "fk to profiles". Because the RLS check is `driver_id = auth.uid()`, the column must store the auth user id (i.e. `drivers.user_id` / `profiles.user_id`). FK target is `auth.users(id)` since `profiles.user_id` is not unique-constrained as a FK target everywhere in this project.

## Task 2 — Admin Upload UI

Add a new collapsible "Tax Documents" section inside `src/components/drivers/DriverDetailSheet.tsx` (visible only when `!readOnly`), or a new component `src/components/drivers/DriverTaxDocuments.tsx` imported by the sheet.

UI:
- Header: "Tax Documents (1099-NEC)" with `FileSpreadsheet` icon.
- Upload form (inline, not modal):
  - `Select` for Tax Year — options = last 7 years, default = previous calendar year.
  - `Input type="file" accept="application/pdf"` (max 10 MB client check).
  - Submit button "Upload 1099" with loading state.
- On submit:
  1. Resolve `driver_user_id` from `driver.user_id` (guard: if missing, toast "Driver has no linked user account").
  2. Upload to bucket `tax-documents` at `{driver_user_id}/{tax_year}/{uuid}.pdf` using `supabase.storage.from('tax-documents').upload(...)`.
  3. Insert row in `public.tax_documents`.
  4. Invalidate query `['tax-documents', driver_user_id]`.
- List below: existing tax documents (year desc), each row shows `Tax Year`, upload date, filename, View (signed URL, opens new tab), Delete (with `AlertDialog` confirm — deletes storage object then DB row).
- New hook: `src/hooks/useDriverTaxDocuments.ts` with `useTaxDocuments(driverUserId)`, `useUploadTaxDocument()`, `useDeleteTaxDocument()`.

## Task 3 — Driver Side Wire-Up

Update `src/components/driver/settlements/TaxAndYtdPanel.tsx`:
- Replace the local `years` memo (currently derived from settlement periods) with a query against `public.tax_documents` filtered to `driver_id = auth.uid()`, returning distinct `tax_year` values desc.
- New small hook `useMyTaxDocuments()` in `src/hooks/useDriverTaxDocuments.ts` (shared file).
- Behaviour:
  - Loading → skeleton on the select + disabled button.
  - Empty → disabled `Select` with placeholder "No forms available" and disabled download button with helper text "Your administrator hasn't uploaded a 1099 yet."
  - Populated → `Select` shows available years, default = newest. Download button enabled.
- Download flow:
  1. Look up the most recent `tax_documents` row for `(auth.uid(), selectedYear)`.
  2. Call `supabase.storage.from('tax-documents').createSignedUrl(file_path, 60)`.
  3. Fetch the URL as a blob, create object URL, trigger anchor click with `download="1099-NEC-{year}.pdf"`, revoke object URL.
  4. Toast success / error.

## Technical Notes

- All new queries use TanStack Query with the project-standard `refetchOnWindowFocus: false` and 5m `staleTime`.
- No changes to `DashboardLayout` wrapping rules.
- No changes to existing settlements logic — only the Tax Year dropdown source + download handler change.
- Semantic tokens only (no hex/`text-white`).
- Driver self-upload is NOT permitted (matches user spec — admins only).

## Files

**New**
- `src/hooks/useDriverTaxDocuments.ts`
- `src/components/drivers/DriverTaxDocuments.tsx`

**Edited**
- `src/components/drivers/DriverDetailSheet.tsx` — mount `<DriverTaxDocuments driver={driver} />` in a new section (hidden when `readOnly`).
- `src/components/driver/settlements/TaxAndYtdPanel.tsx` — swap year source + real download handler.

**Migrations / tool calls**
- `supabase--storage_create_bucket` → `tax-documents`, private.
- `supabase--migration` → create `tax_documents` table, grants, RLS policies, trigger, plus `storage.objects` policies scoped to bucket `tax-documents`.

## Out of Scope

- Generating 1099 PDFs server-side (admins upload externally produced PDFs).
- Bulk upload / CSV import.
- Email notification to driver on upload (can be a follow-up).
