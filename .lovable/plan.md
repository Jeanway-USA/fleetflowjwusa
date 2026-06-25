## Issues

### 1. Detail sheet blocks the Edit dialog
`CRM.tsx` already calls `setDetailContact(null)` inside `handleEdit`, but when the Edit button is pressed **from inside** the open `ContactDetailSheet`, React closes the Sheet and opens the Dialog in the same tick. Radix's Sheet keeps its overlay/focus-trap mounted for one animation frame, so the Dialog renders underneath and pointer events are blocked.

Fix: in `ContactDetailSheet`, when the Edit (pencil) button is clicked, first close the sheet (`onOpenChange(false)`), then invoke `onEdit(contact)` after a short timeout (~150ms — matches Radix close animation). Same handling when the row's dropdown Edit is used while a sheet is already mounted — `handleEdit` in `CRM.tsx` will follow the same pattern (close detail, wait one tick, open form).

### 2. Detail sheet must show all relevant fields per CRM type
Currently `ContactDetailSheet` renders one generic block (name, phone, email, website, address, facility-only hours/dock, tags, notes) and tabs are only shown for CRM-source contacts. That means agent codes, vendor service areas, facility sub-types, etc. are inconsistent.

Restructure the body into a single, type-aware information section driven by `contact.contact_type` + `contact.source`:

- **Broker** (`source: 'crm'`, `contact_type: 'broker'`)
  - Company, primary contact name, phone, email, website, full address
  - Tags
  - Notes
  - Tabs: Activity / Load History / Revenue

- **Agent** (`source: 'resource'` with `resource_type: 'load_agent'`, or CRM-source `contact_type: 'agent'`)
  - Agent Code (large), Agent Status badge (Safe/Unsafe with color)
  - Agency Name, phone, email
  - Information / Notes (full text)
  - Tabs: Activity / Load History / Revenue (CRM-source only); for resource-source agents, show only the info block

- **Facility** (`source: 'facility'`, sub-types: shipper / receiver / both / warehouse / terminal)
  - Facility Name + facility-type badge (real sub-type, including warehouse/terminal/both)
  - Full address with ZIP
  - Contact name, phone, email
  - Operating hours, dock info, appointment-required badge
  - Notes
  - No tabs (existing behavior)

- **Vendor — Mechanic / Truck Wash** (`source: 'resource'`)
  - Company, phone, email, website
  - Address (mechanic/truck wash)
  - Notes
  - No tabs

- **Vendor — Roadside** (`source: 'resource'`, `resource_type: 'roadside'`)
  - Company, phone, email, website
  - Service Area (states) — prominent
  - Notes
  - No tabs

- **Vendor — Other** (`source: 'crm'`, `contact_type: 'vendor'`)
  - Company, contact, phone, email, website, address, tags, notes
  - No tabs (no activity/loads concept for generic vendors)

Implementation: keep one `<SheetContent>` shell + header (badges, edit button), then render one of six small renderers chosen by a `kind` helper that classifies the contact. Reuse the existing icon set (`Phone`, `Mail`, `Globe`, `MapPin`, `Clock`, `Info`) and `Badge` for status pills. Tabs section only renders for the variants that support it.

### Files to change
```text
src/components/crm/ContactDetailSheet.tsx  — rebuild body into type-aware sections; edit button closes sheet before invoking onEdit
src/pages/CRM.tsx                          — handleEdit: close detail first, defer setFormOpen by ~150ms to release Radix focus trap
```

No data, schema, or hook changes.

### Out of scope
- Adding new fields to the database (only fields already collected by `ContactFormDialog` are surfaced).
- Independent-mode `BrokerDatabase` view.
- Activity/Loads/Revenue logic — tabs continue to use the existing CRM-only sub-components.
