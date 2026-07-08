## Approach

Extend the existing signing infrastructure rather than duplicate it. Reuse `document_templates` and `driver_signed_documents`, add signer-routing metadata, add a generic multi-signer store for non-driver signatures, and ship a sitewide `/documents/signing` dashboard that surfaces every user's Action Required / Pending / Completed items.

## Database Migration

1. Enum + columns on `document_templates`:
   - Add `signatory_roles text[] not null default '{driver}'` — ordered array of role labels defining the signing sequence (e.g. `{'driver','manager','owner'}`).
   - Add `required_fields jsonb not null default '[]'` — declared metadata fields templates ask for at signing time.
   - Keep `applies_to` / `document_type` as-is (drivers still filter by employment type).

2. New `public.document_instances`:
   - `id, org_id, template_id, title, status document_status, metadata jsonb, pdf_storage_path text, assigned_to_user uuid, driver_id uuid null, current_step int, created_by, timestamps`.
   - `document_status` enum: `draft | pending_signatures | completed | voided`.
   - RLS: org-scoped select for staff; insert/update by owner + payroll_admin + creator; signer-of-current-step can update to advance.

3. New `public.document_signatures`:
   - `id, org_id, instance_id, signer_id, role_label text, step_index int, signature_data_url text, ip_address text, signed_at, created_at`.
   - RLS: signer can insert their own row; org staff can select; immutable after insert (no update/delete except owner void).
   - Unique `(instance_id, step_index)`.

4. Grants: `authenticated` gets CRUD scoped by policy, `service_role` full. No `anon` access.

5. Backfill: existing `driver_signed_documents` rows stay as-is (single-signer legacy path). Adapter view/helpers unify listing for the dashboard.

6. Trigger `advance_document_instance()` on `document_signatures` insert: if `step_index + 1 == length(signatory_roles)` → mark instance `completed`; else bump `current_step`, insert `driver_notifications` (or generic `notifications` row) for the next role holder.

## Backend / Edge

- `render-document-instance` edge function: hydrates tokens (existing driver tokens + new `{{contractor_state}}`, `{{cdl_number}}`, `{{pay_type}}`, `{{signer_name}}`, `{{signer_role}}`, `{{current_date}}`, `{{company_*}}`), returns HTML for the workspace preview.
- `finalize-document-instance` edge function: on final signature, composes the signed PDF (reuse `generateSignedPdf`), uploads to storage, writes `pdf_storage_path`.

## Frontend

1. **Template Builder upgrades** (`src/pages/admin/DocumentTemplates.tsx` + `DocumentTemplatesPanel.tsx`):
   - Add "Signers" section: ordered list picker (Driver, Supervisor, Manager, Payroll Admin, Owner). Drag to reorder.
   - Add "Required fields" repeater (label + token + type).
   - Extend variable palette with the new tokens.

2. **Sitewide Signing Dashboard** — new page `src/pages/DocumentsSigning.tsx` at `/documents/signing`:
   - Three tabs: **Action Required** (instances where `signatory_roles[current_step]` matches the viewer's role and they haven't signed), **Pending Others** (waiting on someone else), **Completed**.
   - DataTable with title, template, current signer, last action, status badge, Open button.
   - Sidebar link visible to every authenticated role.

3. **Signature Workspace** — new route `/documents/signing/:instanceId`:
   - Split layout. Left: hydrated document body (read-only Markdown → HTML).
   - Right: dynamic metadata inputs (from `required_fields` not yet filled) + existing `SignaturePad` + Submit.
   - After submit → insert `document_signatures` row (trigger advances the instance), toast, redirect to dashboard.

4. **Onboarding consolidation** (`src/components/onboarding/DocumentSignatureStep.tsx`, `DriverOnboarding.tsx`):
   - When a template has `signatory_roles = {'driver'}`, keep today's inline flow (writes to `driver_signed_documents`).
   - When a template has additional signers, create a `document_instances` row on driver submit instead, so it routes to the next signer via the same engine.
   - Outstanding-templates logic reads from both stores so drivers still see prompts either way.

5. **Notifications**: reuse `driver_notifications` for driver-targeted steps; for non-driver steps use a lightweight org-wide notification row surfaced in the app header (link straight to `/documents/signing`).

## Token Hydration

Central helper `src/lib/documents/hydrateTokens.ts` used by both preview and PDF generation. Inputs: template body, driver row (optional), signer profile, org settings, instance metadata. Adds the new tokens listed above and centralizes the existing driver token set so onboarding + sitewide signing share one implementation.

## Out of scope (call out for later)

- Email delivery of signature requests (in-app notifications only for v1).
- Bulk template send to multiple assignees at once.
- Advanced conditional routing / parallel signers.

## Technical notes

- Reuse `SignaturePad`, `generateSignedPdf`, `useAuth`, `PageHeader`, `DataTable`.
- No changes to `driver_signed_documents` schema — treat it as the legacy single-signer table; new multi-signer flow uses the new tables.
- All new tables follow the standard CREATE → GRANT → RLS → POLICY order and include `service_role` grants for edge functions.
- Update `src/App.tsx` routes and `AppSidebar.tsx` to expose `/documents/signing` for all authenticated roles and `/admin/templates` for owners (already exists).
