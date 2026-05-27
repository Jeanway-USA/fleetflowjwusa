## Expose the Maintenance role in Team Management

The `maintenance` role already exists in the `app_role` enum and has labels/badge styles defined, but it's missing from the three role dropdowns in Team Management, so org owners can't actually assign it.

### Change

**`src/components/settings/TeamManagementTab.tsx`** — add `<SelectItem value="maintenance">Maintenance Staff</SelectItem>` to all three role selectors:
- Invite User dialog (around line 342)
- Assign Role dialog (around line 373)
- Edit User dialog (around line 417)

### Out of scope
- No DB migration — enum value already exists.
- No new RLS — existing `has_role(..., 'maintenance')` checks already work (used by the maintenance request/chat flow).
- No subscription tier gating change — Team Management is already gated at the page level.