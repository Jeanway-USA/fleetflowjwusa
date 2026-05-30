## Plan: Add Activity Log to Onboarding & Documents Settings Tab

### Goal
Add an "Activity Log" section at the bottom of the "Onboarding & Documents" tab that displays recent audit trail entries for document template changes.

### Approach
Build a self-contained React component that queries the existing `audit_logs` table, resolves admin names via the `profiles` table, and renders a paginated activity feed.

### Steps

1. **Create `src/components/settings/AuditLogPanel.tsx`**
   - Use TanStack Query (`useQuery`) to fetch `audit_logs` rows where `table_name = 'document_template'`, filtered to the current `org_id`, ordered by `created_at DESC`, with a page size of 10.
   - Fetch the current org's `profiles` (id, first_name, last_name, email) to resolve `user_id` into a display name.
   - Map `action` values to human-readable descriptions:
     - `template_created` → "Created"
     - `template_updated` → "Updated"
     - `template_activated` → "Activated"
     - `template_deactivated` → "Deactivated"
     - `template_deleted` → "Deleted"
   - Use the `details` JSONB field to extract the template `name` (e.g., "Updated Driver Agreement Template").
   - Render a clean, dense data table with three columns: **Timestamp** (date + exact time), **Admin** (first/last name or email fallback), and **Action** (human-readable description).
   - Implement offset-based pagination with a "Load More" button that fetches the next 10 older entries.

2. **Update `src/pages/Settings.tsx`**
   - Import the new `AuditLogPanel` component.
   - Insert `<AuditLogPanel />` at the bottom of the `TabsContent value="onboarding"` section, below `DocumentTemplatesPanel`.

### Technical Details
- **Data source**: `audit_logs` (already populated by the existing DB trigger on `document_templates`).
- **User resolution**: `profiles` table (`id` matches `audit_logs.user_id`). No new DB objects needed.
- **Styling**: Follow existing project patterns — Card wrapper, Tailwind semantic tokens, and shadcn/ui Table or custom timeline markup.
- **No backend changes required**: Reads only from existing tables.
