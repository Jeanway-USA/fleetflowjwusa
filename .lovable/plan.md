## Goal
Add a `document_templates` table that stores editable contract/form templates (markdown + placeholders), scoped per organization. Leave the prior invitation/onboarding work untouched.

## Migration

### New table: `public.document_templates`
Columns:
- `id` uuid PK, default `gen_random_uuid()`
- `org_id` uuid NOT NULL — tenant scope (Core rule)
- `document_type` text NOT NULL — e.g. `driver_agreement`, `direct_deposit`, `driver_profile`
- `name` text NULL — optional human label (e.g. "2026 Driver Agreement v2")
- `content` text NOT NULL — plain text / markdown with `{{placeholder}}` tokens
- `is_active` boolean NOT NULL default `true`
- `version` integer NOT NULL default `1` — supports future revisions
- `created_by` uuid NULL — auth user who saved it
- `created_at` timestamptz NOT NULL default `now()`
- `updated_at` timestamptz NOT NULL default `now()`

Indexes:
- `(org_id, document_type)` — fast lookup of templates by type within an org
- Partial unique `(org_id, document_type) WHERE is_active` — exactly one active template per type per org (prevents ambiguity at invite-acceptance time)

### Placeholder convention (documented, not enforced)
Content uses double-brace tokens that the frontend/edge function will interpolate at render time:
`{{today_date}}`, `{{company_name}}`, `{{company_address}}`, `{{driver_name}}`, `{{driver_address}}`, `{{owner_signature}}`, `{{driver_signature}}`. No DB-side validation — kept flexible so new tokens can be added without schema changes.

### GRANTs
```
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
```
No `anon` — templates are org-private.

### RLS policies (multi-tenant, owner-managed)
- `templates_select_org_staff` — any authenticated user in the org can read active templates (so a driver completing onboarding can fetch the agreement to sign): `org_id = get_user_org_id(auth.uid())`
- `templates_manage_owner` — only owners can insert/update/delete: `is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid())`
- `templates_super_admin` — `is_super_admin()` full access (cross-tenant)

### Triggers
- `update_document_templates_updated_at` BEFORE UPDATE → reuses existing `public.update_updated_at_column()`

## Not changed
- Previously added invitation state + driver onboarding fields (`onboarding_completed`, `signed_*_url`, `onboarding_completed_at`) remain as-is.
- No frontend code changes in this task — `src/integrations/supabase/types.ts` auto-regenerates after migration.

## Out of scope
- Template editor UI
- Placeholder interpolation logic (will live in a future edge function or signing component)
- Seeding default `driver_agreement` / `direct_deposit` / `driver_profile` content
