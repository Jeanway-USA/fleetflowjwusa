

# Merge Resources into CRM

## Overview

Consolidate the separate Resources page (load agents, mechanics, roadside, truck washes, and facilities) into the existing CRM page, creating a single unified contacts directory. The Resources page and its `/resources` route will be removed. The `/resources` URL will redirect to `/crm` so existing bookmarks still work.

---

## What Changes

### Data Stays Where It Is
The existing `company_resources` and `facilities` database tables remain untouched. No data migration needed. Instead, the CRM page will query both tables alongside `crm_contacts` and display everything in one unified view.

### Mapping Resource Types to CRM Types

| Old Resources Tab | CRM Contact Type | Data Source |
|---|---|---|
| Load Agents | Agent | `company_resources` (resource_type = 'load_agent') |
| Mechanics | Vendor | `company_resources` (resource_type = 'mechanic') |
| Roadside | Vendor | `company_resources` (resource_type = 'roadside') |
| Truck Washes | Vendor | `company_resources` (resource_type = 'truck_wash') |
| Facilities (Shipper) | Shipper | `facilities` (facility_type = 'shipper' or 'both') |
| Facilities (Receiver) | Receiver | `facilities` (facility_type = 'receiver' or 'both') |
| Facilities (Warehouse/Terminal) | Shipper | `facilities` (facility_type = 'warehouse'/'terminal') |
| Brokers | Broker | `crm_contacts` (contact_type = 'broker') |

### What You'll See on the CRM Page

The same filter tabs (All, Brokers, Agents, Shippers, Receivers, Vendors) but now the Agents tab also shows load agents from `company_resources`, the Vendors tab shows mechanics/roadside/truck washes, and the Shippers/Receivers tabs show facilities. Each entry displays its data source subtly (e.g., a small "Facility" or "Resource" label) so you can tell them apart.

The unified search will work across all three data sources at once.

### Access Control
The CRM page currently requires owner or dispatcher roles. Since Resources was also visible to safety and driver roles (read-only), the CRM route will be expanded to include safety and driver roles with read-only access (matching what they had before).

---

## Technical Details

### Files to Modify

1. **`src/pages/CRM.tsx`**
   - Import and query `company_resources` and `facilities` tables alongside `crm_contacts`
   - Normalize all three data sources into a unified display format for the table
   - Keep the existing `crm_contacts` CRUD as-is for broker contacts
   - For resources and facilities, use their existing CRUD patterns (same mutations as Resources page)
   - The "Add Contact" button opens a form that creates entries in the appropriate table based on contact type
   - Add a sub-type indicator (e.g., "Mechanic", "Roadside", "Truck Wash") for vendor entries
   - Include facility-specific fields (operating hours, dock info, appointment required) in the detail sheet for facility-type entries

2. **`src/hooks/useCRMData.ts`**
   - Add new hooks: `useCompanyResources()` and `useFacilities()` to fetch from those tables
   - Add a normalizer function that maps resources and facilities into the same shape as CRM contacts for unified display
   - Add resource and facility mutation hooks (create/update/delete)

3. **`src/components/crm/ContactFormDialog.tsx`**
   - Extend the form to handle vendor sub-types (mechanic, roadside, truck_wash) with appropriate fields (service area for roadside, address for others)
   - Add facility-specific fields (operating hours, dock info, appointment required, zip) when the type is shipper/receiver
   - Route the save action to the correct table based on the contact type and data source

4. **`src/components/crm/ContactDetailSheet.tsx`**
   - Show facility-specific info (operating hours, dock info, appointment required) when viewing a facility
   - Show vendor sub-type info (service area for roadside contacts)

5. **`src/components/crm/CRMSummaryCards.tsx`**
   - Update counts to include resources and facilities in the totals

6. **`src/components/layout/AppSidebar.tsx`**
   - Remove the "Resources" nav item
   - Update CRM roles to include `safety` and `driver` (read-only access, matching what Resources had)

7. **`src/App.tsx`**
   - Remove the Resources import and route
   - Add a redirect from `/resources` to `/crm` so existing bookmarks work

### Files to Remove
- `src/pages/Resources.tsx`
- `src/components/resources/FacilitiesTab.tsx`

### No Database Changes
All data stays in its existing tables. No migrations needed. The CRM page simply queries multiple tables and presents them in one unified view.

