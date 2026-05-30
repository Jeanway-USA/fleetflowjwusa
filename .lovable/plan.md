## Goal
Add an owner-only admin page at `/admin/document-templates` for editing the org's `document_templates` rows with a placeholder-variable reference guide alongside the editor.

## Files

### New: `src/pages/admin/DocumentTemplates.tsx`
- Owner-only page (route guarded). No `DashboardLayout` wrapper (per Core rule — `ProtectedRoute` handles layout).
- Loads all `document_templates` for the current `orgId` via TanStack Query.
- Left column (2/3): template list + editor
  - Tabs or select dropdown of document types found in DB
  - "New template" button — prompts for `document_type` + `name`, inserts empty content
  - Inputs: `name`, `document_type` (text input), `is_active` (switch), large `<Textarea>` (min-h-[500px], monospace) for `content`
  - Save button — `update` mutation on the selected row (or `insert` if new). Includes `org_id` in payload (Core rule for multi-tenant inserts). Invalidates query on success, shows `sonner` toast.
- Right column (1/3, sticky): **Variable Reference Guide** card
  - Title + intro: "Insert these tokens into your template — they'll be replaced when the document is rendered to the driver."
  - List of 5 variables, each row: `<code>{{token}}</code>` + description + a "Copy" button that writes to clipboard and toasts
    - `{{today_date}}` — Auto-fills today's date when the document is generated
    - `{{company_address}}` — Auto-fills "4700 Diplomacy Rd, Fort Worth, TX 76155"
    - `{{driver_address}}` — Renders an input field for the driver to fill in
    - `{{owner_signature}}` — Placeholder signature block (signed off-platform for now)
    - `{{driver_signature}}` — Renders the SignaturePad component for the driver to sign
  - Small tip footer about case-sensitivity & exact double-brace syntax.

### Modified: `src/App.tsx`
- Add lazy import: `const DocumentTemplates = lazy(() => import("./pages/admin/DocumentTemplates"));`
- Add route under "Settings" section:
  ```tsx
  <Route path="/admin/document-templates" element={
    <ProtectedRoute allowedRoles={['owner']}>
      <DocumentTemplates />
    </ProtectedRoute>
  } />
  ```

## Technical details
- DB writes use the existing supabase client `from('document_templates')` with `org_id` + `created_by: user.id` on insert.
- Uses semantic Tailwind tokens only (no raw colors).
- Uses shadcn components: `Card`, `Button`, `Input`, `Textarea`, `Switch`, `Label`, `Tabs`, `Tooltip`. No rich text editor — plain `<Textarea>` keeps the `{{token}}` placeholders intact (a WYSIWYG would mangle them).
- No nav link added in this task — page accessible via direct URL. (Can be linked from Settings later.)

## Out of scope
- Placeholder interpolation/rendering (handled later by the signing flow).
- Seeding default templates.
- Version history UI (column already exists; future enhancement).
