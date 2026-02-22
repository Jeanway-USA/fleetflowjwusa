

## Plan: Migrate Existing Files to Google Drive on Connect

When an organization connects Google Drive, all their existing files in built-in storage will be automatically migrated to Google Drive and then deleted from platform storage.

### What happens when you connect Google Drive

1. OAuth flow completes, root folder is created (as it does today)
2. A new `migrate_existing` action runs automatically right after connection
3. It queries all files owned by the org across all relevant tables (`documents`, plus any other file references)
4. For each file in built-in storage:
   - Downloads it from built-in storage
   - Uploads it to the correct Google Drive subfolder (same bucket/path structure)
   - Updates the database record's `file_path` to the new `gdrive:` reference
   - Deletes the original from built-in storage
5. Files that already have `gdrive:` paths are skipped
6. Migration progress/results are returned to the UI

### What changes and where

| File | Change |
|------|--------|
| `supabase/functions/storage-proxy/index.ts` | Add a new `migrate` action that handles bulk migration of files for an org |
| `src/components/settings/StorageTab.tsx` | After successful OAuth exchange, call the migrate action; show migration progress/status |

### Technical Details

**New `migrate` action in `storage-proxy` edge function:**
- Accepts POST with `action=migrate`
- Queries `documents` table for all files in the org where `file_path` does NOT start with `gdrive:`
- Also queries files from other tables that store file paths (e.g., `dvir_photos` path columns, `branding-assets`)
- For each file:
  1. Download from built-in storage bucket using service role
  2. Upload to Google Drive with proper folder structure
  3. Update the DB row's `file_path` to `gdrive:{driveFileId}`
  4. Delete from built-in storage
- Returns a summary: `{ migrated: number, failed: number, errors: string[] }`
- Handles errors per-file gracefully (skips failures, continues with the rest)

**StorageTab UI changes:**
- After the `exchange_code` call succeeds, automatically invoke the `migrate` action
- Show a loading state: "Migrating existing files to Google Drive..."
- Display a toast with results: "Migrated X files to Google Drive" or partial failure message
- The "How it works" section updated to mention that existing files are migrated on connect

**Buckets to migrate from:**
- `documents` (27 files) -- referenced in `documents` table via `file_path`
- `dvir-photos` (3 files) -- referenced in `driver_inspections` table
- `dvir-signatures` (3 files) -- referenced in `driver_inspections` table
- `branding-assets` (2 files) -- referenced in `company_settings` table

**Edge cases handled:**
- Files already on Google Drive (path starts with `gdrive:`) are skipped
- Files that fail to migrate are logged but don't block others
- If Google Drive API fails mid-migration, a partial result is returned
- The migration is idempotent -- running it again only migrates files not yet moved
