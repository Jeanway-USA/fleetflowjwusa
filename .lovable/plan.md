

## Bring-Your-Own-Storage: Google Drive per Organization

### Overview
Each organization connects their own Google Drive account in Settings. All file uploads (documents, DVIR photos, signatures, branding assets) are stored in the org's Drive folder instead of the platform's built-in storage. This eliminates platform storage costs entirely and keeps company data fully private.

---

### How It Works (User Perspective)

1. **Owner goes to Settings > Storage** (new tab)
2. Clicks "Connect Google Drive" -- OAuth consent screen appears
3. Grants FleetFlow access to a specific Drive folder
4. From that point on, all uploads for that org go to their Drive
5. All downloads/views are proxied through a backend function that fetches from Drive

---

### Architecture

The system needs three layers:

**A. OAuth Connection (per org)**
- Each org owner authenticates with Google and grants Drive file access
- The resulting OAuth refresh token is stored encrypted in the database (like Landstar credentials use AES-256-GCM today)
- A new `org_storage_config` table stores: org_id, provider ("google_drive"), encrypted credentials, root folder ID, connected status

**B. Storage Proxy Edge Function**
- A single edge function (`storage-proxy`) handles upload/download requests
- On upload: uses the org's Google Drive refresh token to get an access token, uploads the file to their Drive folder, returns the Drive file ID
- On download: fetches the file from Drive using stored credentials, returns it to the browser
- The `documents` table's `file_path` column stores the Drive file ID instead of a storage path

**C. UI Changes**
- New "Storage" tab in Settings for connecting/disconnecting Google Drive
- All 12 files that currently call `supabase.storage` get updated to use the proxy function instead
- A unified `useStorageProvider` hook replaces direct storage calls

---

### Implementation Plan

#### Phase 1: Database and Backend

**New table: `org_storage_config`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| org_id | uuid | FK to organizations, unique |
| provider | text | "google_drive" or "built_in" |
| encrypted_credentials | text | AES-256-GCM encrypted OAuth tokens |
| root_folder_id | text | Google Drive folder ID |
| connected_at | timestamptz | When connected |
| is_active | boolean | Whether to use this provider |

RLS: only owners of the org can read/write.

**New edge function: `storage-proxy`**
- Endpoints: `POST /upload`, `GET /download?fileId=...`, `DELETE /delete?fileId=...`
- Validates JWT, looks up org's storage config
- If provider is "google_drive": uses Google Drive API
- If provider is "built_in" or no config: falls back to Supabase storage (current behavior)
- Handles token refresh automatically

**New edge function: `google-drive-auth`**
- Handles OAuth callback from Google
- Exchanges auth code for refresh token
- Encrypts and stores in `org_storage_config`
- Requires a Google Cloud project with Drive API enabled (you would create this once and provide the Client ID/Secret as secrets)

#### Phase 2: Unified Storage Hook

**New hook: `useStorageProvider`**
```text
- uploadFile(bucket, path, file) -> fileId or path
- getFileUrl(bucket, pathOrId) -> signed URL or proxied URL
- deleteFile(bucket, pathOrId)
```
- Checks org's storage provider setting
- Routes to either the storage-proxy edge function (Google Drive) or the existing Supabase storage calls
- Replaces all direct `supabase.storage` calls across the 12 affected files

#### Phase 3: Settings UI

**New tab in Settings: "Storage"**
- Shows current storage provider (Built-in or Google Drive)
- "Connect Google Drive" button that opens OAuth popup
- Status indicator showing connection health
- "Disconnect" option that reverts to built-in storage
- Warning that disconnecting does NOT migrate files back automatically

#### Phase 4: Migrate Existing Files (Optional Tool)

- A one-time migration utility in Settings that copies existing files from built-in storage to the newly connected Google Drive
- Updates all `file_path` references in the `documents` table

---

### Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/...` | New table `org_storage_config` with RLS |
| `supabase/functions/storage-proxy/index.ts` | New -- handles upload/download/delete via Drive or fallback |
| `supabase/functions/google-drive-auth/index.ts` | New -- OAuth flow for connecting Drive |
| `src/hooks/useStorageProvider.ts` | New -- unified storage abstraction |
| `src/components/settings/StorageTab.tsx` | New -- UI for connecting/managing storage provider |
| `src/pages/Settings.tsx` | Updated -- add Storage tab |
| `src/hooks/useSignedUrl.ts` | Updated -- route through storage provider |
| `src/hooks/useDocumentUpload.ts` | Updated -- use storage provider |
| `src/components/driver/DocumentScanButton.tsx` | Updated -- use storage provider |
| `src/components/driver/PreTripForm.tsx` | Updated -- use storage provider |
| `src/components/driver/PostTripForm.tsx` | Updated -- use storage provider |
| `src/components/driver/PhotoCapture.tsx` | Updated -- use storage provider |
| `src/components/driver/ProofOfDeliveryDialog.tsx` | Updated -- use storage provider |
| `src/components/maintenance/CompleteJobModal.tsx` | Updated -- use storage provider |
| `src/components/loads/RateConfirmationUpload.tsx` | Updated -- use storage provider |
| `src/components/settings/BrandingTab.tsx` | Updated -- use storage provider |
| `src/pages/Documents.tsx` | Updated -- use storage provider |
| `src/pages/Drivers.tsx` | Updated -- use storage provider (avatar uploads) |

---

### Prerequisites (Before Building)

You will need to set up a **Google Cloud project** with the Drive API enabled and create OAuth 2.0 credentials (Client ID + Client Secret). These get stored as backend secrets. This is a one-time setup you do -- your users never see Google Cloud, they just click "Connect Google Drive" and sign in with their Google account.

Estimated setup time: about 15 minutes in the Google Cloud Console.

---

### Cost Comparison

| | Built-in Storage | Google Drive (Free tier) |
|---|---|---|
| Storage | Usage-based | 15 GB free per Google account |
| Egress | Usage-based | Free (API calls have quotas) |
| Your cost | Grows with users | Zero -- org pays nothing extra if within their Drive quota |
| Google Workspace | N/A | Orgs with Workspace get 30GB-5TB per user |

---

### Trade-offs to Consider

- **Latency**: Proxying through an edge function adds a small delay vs direct storage access
- **Google API quotas**: Default is 20,000 queries/100 seconds -- plenty for a TMS but worth monitoring
- **15 GB free limit**: Small orgs will be fine; larger fleets with many DVIR photos may need Google Workspace or a paid Google plan
- **Complexity**: More moving parts than built-in storage (OAuth token refresh, error handling)
- **Offline/mobile**: Driver uploads from the road work the same way -- the edge function handles the Drive upload server-side

