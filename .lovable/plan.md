

## Replace Users & Roles with TeamManagementTab

### Overview
Extract the inline "Users & Roles" tab content from `Settings.tsx` into a new `TeamManagementTab.tsx` component. Replace the custom list view with a proper `DataTable` showing Name, Email, Role, and Status columns. Replace the invite Dialog with a Sheet. Keep all existing functionality (edit, delete, password reset, role assignment).

### Changes

**1. Create `src/components/settings/TeamManagementTab.tsx`**
- Move all user management state and logic out of Settings.tsx into this component
- Use `DataTable` with columns: Name, Email, Role (badge), Status (Active/Invited), Actions
- Status logic: if `first_name` is null and role exists → "Invited" (user was invited but hasn't completed onboarding); otherwise "Active"
- "Invite Member" button at top opens a `Sheet` (not Dialog) with email input + role dropdown
- Role dropdown options: Owner, Dispatcher, Payroll Admin, Safety, Driver (matching existing `app_role` enum)
- Actions column: Edit, Reset Password, Delete buttons (same as current, hidden for self)
- Keep existing Dialogs for edit/delete/reset-password/assign-role as they are (just moved into this component)

**2. Simplify `src/pages/Settings.tsx`**
- Remove all user management state, queries, mutations, and handlers (~250 lines)
- Remove all user-related Dialogs (assign role, invite, edit, delete, reset password)
- Import and render `<TeamManagementTab />` inside `<TabsContent value="users">`
- Rename tab label from "Users & Roles" to "Team"

**3. No edge function changes needed**
- The existing `invite-user` edge function already handles creating the invite and assigning the role

### DataTable Column Spec
```text
| Name              | Email             | Role         | Status  | Actions      |
|-------------------|-------------------|--------------|---------|--------------|
| John Doe          | john@example.com  | Owner (badge)| Active  | ✏️ 🔑 🗑️    |
| —                 | new@example.com   | Driver       | Invited | ✏️ 🔑 🗑️    |
```

### Files
| File | Action |
|---|---|
| `src/components/settings/TeamManagementTab.tsx` | Create — DataTable + Sheet invite |
| `src/pages/Settings.tsx` | Simplify — remove inline user management, import TeamManagementTab |

