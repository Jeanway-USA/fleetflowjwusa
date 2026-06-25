## Goal

Make the CRM table columns type-aware so each tab (Brokers, Agents, Shippers, Receivers, Vendors/Shops, All) shows the columns that actually have data for that contact type — eliminating the empty `—` cells caused by the current one-size-fits-all column set.

## Current problem

`src/pages/CRM.tsx` renders a single column set for every tab:

`Company | Contact | Type | Phone | Location | Details`

Because `UnifiedContact` is normalized from three sources (`crm_contacts`, `company_resources`, `facilities`), most rows are missing fields the column expects:

- **Agents** (`source: 'resource'`) — `contact_name` is always `null` → blank, `city`/`state` are always `null` → blank; agent_code/status/service area never get a column.
- **Facilities (Shipper/Receiver/Warehouse/Terminal)** — `contact_name` often blank, no agent code, hours/dock/appointment hidden inside "Details".
- **Vendors – Roadside** — service area is the key field but only shows up in "Location" as a fallback.
- **Vendors – Mechanic / Truck Wash / Shops** — address column blank because city/state aren't stored on resources (only `address`).
- **Brokers** — MC# (agent_code) is buried in a small caption under company name and credit/days-to-pay tags are jammed into "Details".

## Plan

Replace the single static `columns` array in `src/pages/CRM.tsx` with a `getColumnsFor(typeFilter, scope)` helper that returns a column set tailored to the active tab. Actions column stays identical across all sets.

### Column sets

**Brokers tab** (`typeFilter === 'broker'`)
`Company | Contact Name | MC# | Phone | Email | Location | Tags`
- MC# from `agent_code` (mono badge, "—" only when truly missing)
- Location = `city, state`
- Tags from `tags[]`

**Agents tab** (`typeFilter === 'agent'`)
`Agent Name | Agent Code | Agency | Status | Phone | Email | Service Area`
- Agent Name from `company_name`
- Agency from `contact_name` (mirrors how the agent form stores agency name) with fallback to `—`
- Status badge from `agent_status` (Safe / Unsafe / Unknown)
- Service Area from `service_area`

**Shippers / Receivers tabs** (`typeFilter === 'shipper' | 'receiver'`)
`Facility Name | Sub-Type | Address | Contact | Phone | Hours | Appt`
- Sub-Type = `getSubTypeLabel(contact)` (Shipper Facility / Receiver Facility / Both / Warehouse / Terminal)
- Address = `address, city, state zip` assembled with proper fallbacks
- Contact = `contact_name`
- Hours = `operating_hours`
- Appt = badge when `appointment_required`

**Maintenance Shops scope** (`scope === 'shops'`)
`Shop Name | Sub-Type | Phone | Email | Service Area | Address | Tags`
- Sub-Type from `resource_type` via `getSubTypeLabel` (Mechanic / Roadside / Truck Wash)
- For Roadside, Service Area is prominent

**All tab** (`typeFilter === 'all'` in agencies scope)
Keep the current generic columns but improve them:
`Company | Type (badge + sub-type) | Identifier | Phone | Location/Service Area | Flags`
- Identifier column = MC# for brokers, Agent Code for agents, Sub-Type for facilities, "—" otherwise
- Location = `city, state` with fallback to `service_area`, then to `address`, then `—`
- Flags = the existing Auto-added / Appt Req / Safe / Unsafe / tag chips

### Render helpers

Add small inline helpers at the top of `AgentCRM`:
- `formatAddress(c)` — joins `address`, `city`, `state`, `zip`, trims, returns `—` if empty.
- `formatLocation(c)` — `city, state` || `service_area` || `—`.
- `renderAgentStatus(c)` — colored badge for `safe` / `unsafe` / null.
- `renderMC(code)` — `<code>` chip when present.

These keep the column render functions short.

### Things that do NOT change

- `useUnifiedContacts` hook, mutations, detail sheet, edit dialog, filtering/search logic.
- Action menu (View / Edit / Delete) and bulk-select behavior.
- Summary cards, scope tabs, type filter tabs.
- `tableId` / `exportFilename` (CSV export still works because DataTable iterates the active columns).
- `BrokerDatabase` (Independent mode) is untouched — it already has its own purpose-built columns.

## Technical notes

- All changes live in `src/pages/CRM.tsx`. No hook, schema, or detail-sheet edits.
- `DataTable` accepts a fresh `columns` array per render, so swapping based on `typeFilter`/`scope` inside a `useMemo` is safe and won't break the existing `selectable` / `bulkActions` props.
- Mobile: keep `hiddenOnMobile` on secondary columns (everything except Company/Name, primary identifier, and Actions) so the responsive layout stays usable.
- Empty-state fallbacks render `—` only when a field is genuinely absent for that type (e.g. a broker with no MC#), not because the column was wrong for the row.
