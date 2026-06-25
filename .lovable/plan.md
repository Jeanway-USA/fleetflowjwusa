## What's broken on the Agent CRM

After tracing every contact type through create → list → edit → display (`ContactFormDialog`, `useCRMData`, `ContactDetailSheet`, `CRM.tsx`), I found four real mismatches between the data being collected, what gets saved, and what the edit dialog re-loads.

### Bug 1 — Editing "Vendor — Other" (CRM vendors) opens an empty/wrong form
- Saved as `crm_contacts.contact_type = 'vendor'`.
- On edit, `getFormType()` returns the raw `'vendor'`, but the type Select only knows `vendor-mechanic / -roadside / -truck_wash / -other`. None of the `isAgent / isFacility / isVendor / isBroker` branches match, so the dialog renders generic fields with no tags, no sub-type, no save target awareness.
- Fix: in `getFormType`, when a CRM contact has `contact_type === 'vendor'` return `'vendor-other'`.

### Bug 2 — Facility sub-type can never be edited
- Facilities support 5 sub-types (`shipper / receiver / both / warehouse / terminal`), but the Facility-Type selector is gated by `!isEditing`, so once created it's locked.
- Additionally `mapFacilityType()` collapses `both / warehouse / terminal` into `'shipper'`, meaning the badge in the list + detail sheet says "Shipper" for a warehouse.
- Fix:
  - Always show the Facility-Type selector when `isFacility` (create AND edit), and persist `facility_type` on update.
  - Add `'warehouse' | 'terminal' | 'both'` to the `ContactType` union so the badge reflects what was actually saved; update `mapFacilityType` to return the real value; extend `TYPE_COLORS` and the agency tab filters accordingly (or keep tab filter as `shipper|receiver` but stop forcing the badge to lie).

### Bug 3 — Agent "Company Name" field is mislabeled and loses data on edit
- For agents the dialog shows one input labeled "Notes / Name" bound to `company_name`, plus a separate Notes textarea bound to `notes`. On save, `company_name` is overwritten with `agent_code || company_name`, so whatever the user typed as the agency name is silently replaced by the 3-letter code. On re-open the "Name" field then shows the code.
- Fix:
  - Rename the field to "Agency Name" (optional), keep it bound to `company_name`, and stop overwriting it — save `company_name: form.company_name || trimmedAgentCode`.
  - Apply the same rule to both the resource path (`company_resources.name`) and the CRM path (`crm_contacts.company_name`) so auto-harvested agents (which start as just the code) become editable to a real name.

### Bug 4 — Facility contact fields don't round-trip
- `normalizeFacility` maps `contact_phone → phone` and `contact_email → email`, but the form's Phone/Email inputs are bound to `form.phone / form.email` and on update we write back to `contact_phone / contact_email`. That part is fine — but `contact_name` is shown only inside the `!isAgent` "Contact Person" input, which is correct. However the dialog never loads `zip`, `operating_hours`, `dock_info`, or `appointment_required` into the form unless `editContact.facility_type` exists; verify the normalizer returns those fields (it does) and that the form's facility section renders during edit (it does once Bug 2 unlocks `isFacility`-aware rendering — confirm no other gate hides it).
- Fix: nothing extra beyond Bug 2; just verify after Bug 2 that ZIP / hours / dock / appointment all populate on edit. (Quick test pass.)

### Files to change

```text
src/components/crm/ContactFormDialog.tsx   — getFormType, agent label, facility-type select gating, agent company_name save rule
src/hooks/useCRMData.ts                    — ContactType union, mapFacilityType, normalizers (no functional change beyond returning real facility_type)
src/pages/CRM.tsx                          — TYPE_COLORS additions for new facility sub-types (badge styling)
```

No DB schema changes, no migrations, no RLS changes — purely client-side data/display fixes.

### Out of scope
- Restructuring agent storage (resource vs crm_contacts duality) — leaving as-is.
- Activity timeline / revenue tabs for non-CRM contacts — unchanged.
- Independent-mode `BrokerDatabase` view — unchanged.
