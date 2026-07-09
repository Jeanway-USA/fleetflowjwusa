
## Goal

Allow authorized users (owners/admins — same gate as "Send document") to take a completed or in-progress document instance and send it back to **Action Required**, either from a specific step or from the beginning, so the correct person can re-sign.

## UX

On the **Document Signing** list (`src/pages/DocumentsSigning.tsx`) and the **workspace** header (`src/pages/DocumentSigningWorkspace.tsx`):

- Add a "Reopen for re-signing" button on each card/header, visible only when `canSimulateRoles` is true and instance status is `completed` or `pending_signatures`.
- Clicking it opens a small dialog (`ReopenDocumentDialog.tsx`) with:
  - Which step to rewind to (dropdown of `signatory_roles`, default = first step).
  - Optional "Reassign to specific user" picker (org users matching that step's role). Leaving empty = anyone with that role can pick it up (clears `assigned_to_user`).
  - Reason field (required, short text) captured in audit log.
  - Confirm button labeled "Send back to Action Required".
- Confirmation warns that all signatures at/after the chosen step will be removed and the signed PDF will be discarded.

## Behavior

On confirm, call a new edge function `reopen-document-instance` that (server-side, service-role, org-scoped, permission-checked):

1. Loads the instance, verifies caller belongs to `instance.org_id` and has `owner`/`admin` role.
2. Rejects if status is `draft` or `voided`.
3. Deletes rows from `document_signatures` where `instance_id = :id AND step_index >= :fromStep`.
4. Deletes the completed PDF from the `signed-documents` bucket when `pdf_storage_path` is set.
5. Updates `document_instances`:
   - `status = 'pending_signatures'`
   - `current_step = :fromStep`
   - `completed_at = null`
   - `pdf_storage_path = null`
   - `assigned_to_user = :reassignTo ?? null`
   - `updated_at = now()`
6. Writes an entry to `document_events` (or existing audit table used by the module) recording actor, reason, and range reopened.

Client invalidates `document_instances` and `document_signatures_mine` queries; toast confirms; the instance now shows in **Action Required** for the correct signer.

## Files

- **Add** `supabase/functions/reopen-document-instance/index.ts` — edge function above; register in `supabase/config.toml`.
- **Add** `src/components/documents/ReopenDocumentDialog.tsx` — dialog UI + mutation calling the edge function via `invoke-with-auth`.
- **Edit** `src/pages/DocumentsSigning.tsx` — add "Reopen" button on each `InstanceList` row (gated by `canSimulateRoles` + status), wire dialog.
- **Edit** `src/pages/DocumentSigningWorkspace.tsx` — add "Reopen for re-signing" button in the header actions with the same gate.

## Out of scope

- No schema changes; existing columns (`status`, `current_step`, `assigned_to_user`, `completed_at`, `pdf_storage_path`) cover the flow.
- No changes to driver-facing components.
- No changes to the signing/rendering workspace logic itself — once reopened, the standard flow handles re-signing.
