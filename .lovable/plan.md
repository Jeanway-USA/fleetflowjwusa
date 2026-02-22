

## Plan: Dynamic Folder Name, Drive Link, and E2E Test

### 1. Rename root folder to organization name

**google-drive-auth edge function** (exchange_code action, ~line 159-177):
- Before creating the root folder, fetch the org name from the `organizations` table using the already-known `orgId`
- Use the org name (e.g. "JeanWay USA") as the folder name instead of hardcoded "FleetFlow Storage"
- Fallback to "FleetFlow Storage" if the org name is unavailable

### 2. Add a "Open in Google Drive" link in StorageTab

**StorageTab.tsx**:
- When connected, render a button/link that opens `https://drive.google.com/drive/folders/{root_folder_id}` in a new tab
- The `root_folder_id` is already returned by the status query in the `config` object
- Use an `ExternalLink` icon from lucide-react for the button

### 3. E2E testing suggestion

After implementing, manually test:
- Navigate to Settings > Storage
- Verify the "Open in Google Drive" link appears and opens the correct folder
- Go to Documents, upload a file, then check Google Drive to confirm the folder structure is correct (org-named root > bucket > path)

### Technical Details

**File changes:**

| File | Change |
|------|--------|
| `supabase/functions/google-drive-auth/index.ts` | Fetch org name from `organizations` table; use it as Drive folder name |
| `src/components/settings/StorageTab.tsx` | Add "Open in Google Drive" link using `config.root_folder_id` |

**google-drive-auth change (exchange_code section):**
```
// Before creating root folder:
const { data: orgData } = await supabase
  .from('organizations')
  .select('name')
  .eq('id', orgId)
  .single();

const folderName = orgData?.name || 'FleetFlow Storage';

// Use folderName instead of 'FleetFlow Storage' in the Drive API call
```

**StorageTab change (when connected):**
- Add an "Open in Google Drive" button below the connected status card that links to `https://drive.google.com/drive/folders/${config.root_folder_id}`
- Only show when `config.root_folder_id` exists and is not `'root'`

