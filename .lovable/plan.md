

## Merge Facilities into Resources Page

The Facilities page will be consolidated into the Resources page as a new "Facilities" tab alongside the existing resource type tabs (Load Agent, Mechanic, Roadside, Truck Wash).

---

### What Changes

**1. Create a new FacilitiesTab component**
- Extract all facility logic (query, mutations, search, filter, table, dialog) from `src/pages/Facilities.tsx` into a new `src/components/resources/FacilitiesTab.tsx`
- This component will be self-contained with its own search, type filter, summary cards, table, and add/edit dialog
- It will receive `canEdit` as a prop to respect the existing driver read-only permission model

**2. Update the Resources page**
- Add a 5th tab called "Facilities" (with a Building2 icon) to the existing TabsList
- The tab will render the new `FacilitiesTab` component
- Update the "Add Resource" button in the PageHeader to contextually show "Add Facility" when the Facilities tab is active
- The Facilities tab count badge will show the total number of facilities

**3. Remove the standalone Facilities page and route**
- Remove the `/facilities` route from `src/App.tsx`
- Remove the `Facilities` import from `src/App.tsx`
- Remove the "Facilities" sidebar entry from `src/components/layout/AppSidebar.tsx`
- Delete `src/pages/Facilities.tsx` (no longer needed)

---

### Technical Details

**New file:**
- `src/components/resources/FacilitiesTab.tsx` -- contains all facility CRUD logic, search/filter UI, summary cards, table, and add/edit dialog. Accepts a `canEdit: boolean` prop.

**Modified files:**
- `src/pages/Resources.tsx`
  - Add `Building2` to lucide imports
  - Add a `'facilities'` entry (not part of `RESOURCE_TYPES` since it uses a different data source)
  - Expand the `TabsList` grid from `grid-cols-4` to `grid-cols-5`
  - Add a new `TabsContent` for `"facilities"` that renders `<FacilitiesTab />`
  - Update PageHeader action to show "Add Facility" when `activeTab === 'facilities'`
  - Hide the resource search bar when on the facilities tab (FacilitiesTab has its own search)
  - Hide the load agent scorecard when on the facilities tab

- `src/App.tsx`
  - Remove the `Facilities` import and `/facilities` route

- `src/components/layout/AppSidebar.tsx`
  - Remove the `{ title: 'Facilities', ... }` entry from `operationsNavItems`

- `src/pages/Facilities.tsx` -- deleted (content moved to FacilitiesTab)

