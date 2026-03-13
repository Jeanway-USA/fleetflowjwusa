

## Plan: Replace POD Photo Upload with Transflo Link Input

### What changes

In `src/components/driver/ProofOfDeliveryDialog.tsx`, replace the entire "BOL / POD Photos" section (camera/gallery upload, photo grid, file inputs) with a single text input field where the driver pastes their Transflo viewer link.

### Details

**Remove:**
- `photos` state, `fileInputRef`, `cameraInputRef`
- `handleFileSelect`, `removePhoto` functions
- Photo grid UI, Camera/Gallery buttons, hidden file inputs
- Photo upload logic in `handleSubmit` (storage upload loop + document inserts for `proof_of_delivery` type)

**Add:**
- `transfloLink` string state
- A labeled input field: "Transflo POD Link" with placeholder `https://viewer.transfloexpress.com/ViewBatchExM.aspx?ConfNumber=...`
- Helper text: "Paste the link from your Transflo Express app"
- Basic URL validation on submit (must start with `https://viewer.transfloexpress.com/`)
- Save the link as a document record with `document_type: 'transflo_pod'` and `file_path` set to the Transflo URL (no file upload needed)

**Keep unchanged:**
- Signature pad and signature upload
- Exception reporting
- Load status update to `delivered`
- Status log entry

### File to edit
- `src/components/driver/ProofOfDeliveryDialog.tsx`

