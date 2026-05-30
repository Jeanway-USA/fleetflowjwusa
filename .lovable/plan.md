## Objective
Embed the existing `DocumentTemplates` editor directly inside the Settings → Onboarding & Documents tab, below the Global Invite Preferences card, so owners can manage templates without leaving Settings.

## Plan

### 1. Extract reusable panel
Refactor `src/pages/admin/DocumentTemplates.tsx` by lifting its inner UI into a new component:

- New file: `src/components/settings/DocumentTemplatesPanel.tsx`
  - Exports `DocumentTemplatesPanel` — contains the entire master-detail editor (template `Select`, type/name inputs, Active switch, content `Textarea`, Save button, Variable Reference Guide sidebar, and the "New template" `Dialog`).
  - Drops the page-level container (`container mx-auto p-4 sm:p-6` and big `h1` page header) so it composes cleanly inside a tab.
  - Keeps all existing data hooks: `useQuery(['document_templates', orgId])`, save/create mutations, `VARIABLES` list, `copyToken` clipboard handler.
  - Wraps its top section in a small header row: "Document Templates" subheading + `New template` button (matching the visual rhythm of `OnboardingPreferencesCard`).

- Update `src/pages/admin/DocumentTemplates.tsx` to be a thin page wrapper that renders `<PageHeader title="Document Templates" .../>` plus `<DocumentTemplatesPanel />`. This keeps the `/admin/document-templates` route working but makes the heavy component reusable.

### 2. Wire into Settings tab
File: `src/pages/Settings.tsx`

- Import `DocumentTemplatesPanel` from `@/components/settings/DocumentTemplatesPanel`.
- Inside `<TabsContent value="onboarding">`, replace the current "No document templates yet" placeholder `Card` with `<DocumentTemplatesPanel />`, leaving the descriptive intro card and `OnboardingPreferencesCard` above it untouched. Order: intro → preferences → templates panel.

### 3. Variable reference + editor behaviour
No behaviour changes — the existing panel already handles:
- Rich text editing via large `Textarea` (markdown supported).
- Variable Reference Guide listing `{{today_date}}`, `{{company_address}}`, `{{driver_address}}`, `{{owner_signature}}`, `{{driver_signature}}` with copy-to-clipboard buttons.
- Edit, save (`saveMutation`), activate/deactivate (`is_active` Switch), and create-new (`createMutation`) — all already work against `document_templates` with existing RLS (`templates_manage_owner`).

### 4. Verification
- Settings → Onboarding & Documents shows: intro card → Global Invite Preferences → Document Templates editor with sidebar.
- Edit content + toggle Active + Save → toast success and value persists on reload.
- Click "New template" → dialog → create → newly created template auto-selected.
- `/admin/document-templates` route still loads the same editor via the page wrapper.

## Files touched
- `src/components/settings/DocumentTemplatesPanel.tsx` (new — extracted from existing page)
- `src/pages/admin/DocumentTemplates.tsx` (thin wrapper)
- `src/pages/Settings.tsx`

## Out of scope
- No DB schema changes (table, RLS, and grants already exist).
- No swap to a WYSIWYG rich text editor — the current `Textarea` markdown editor with the variable guide stays.
- No removal of the `/admin/document-templates` route.