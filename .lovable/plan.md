

## Upgrade Existing Org Simulation to "Impersonate Org" Styling

The impersonation feature is **already fully functional**. The only changes needed are visual/naming tweaks:

### Changes

**`src/components/superadmin/OrgActionsDropdown.tsx`**
- Rename "Simulate" label to "Impersonate Org"

**`src/components/layout/DashboardLayout.tsx`**
- Change the simulation banner from amber to **red** (`bg-red-600 text-white`)
- Make it sticky/persistent at the very top (above everything)
- Update text to "Viewing as {OrgName} — Click to Exit"
- Make the entire banner clickable to exit (not just a small button)
- Add a pulsing dot or shield icon for extra visibility

### No backend or context changes needed
`AuthContext` already overrides `orgId` with the simulated org, so all RLS-filtered queries automatically scope to the target organization.

### Files
| File | Change |
|------|--------|
| `src/components/superadmin/OrgActionsDropdown.tsx` | Rename "Simulate" → "Impersonate Org" |
| `src/components/layout/DashboardLayout.tsx` | Red banner, new copy, fully clickable to exit |

