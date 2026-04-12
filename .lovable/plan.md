

## Build IndependentLoadBuilder Component

### Overview
A clean 3-tab manual load creation form tailored for Independent Owner-Operators, focused on broker details rather than internal company fields. Replaces the generic "Add Load" dialog experience when in Independent mode.

### File: `src/components/loads/IndependentLoadBuilder.tsx` (Create)

**Structure**: A Card wrapping shadcn Tabs with 3 tabs and a persistent footer.

**Tab 1 — "1. Broker & Rate"** (Building icon)
- Brokerage Name input with a simulated autocomplete dropdown (Combobox-style: hardcoded suggestions like "CH Robinson", "TQL", "Coyote Logistics", "Echo Global", "XPO Logistics" that filter on type)
- Broker Load / PO Number input
- Linehaul Rate ($) number input (DollarSign icon)
- Accessorial Pay ($) number input
- Calculated read-only Total Gross Rate field (linehaul + accessorial, auto-computed)
- "Factoring Approved?" Switch toggle

**Tab 2 — "2. Route & Stops"** (MapPin icon)
- Shipper (Pick-up) section: Facility Name, Address, Date (date input), Time (text input)
- Consignee (Delivery) section: same fields
- "Add Intermediate Stop" secondary button that appends a new stop section with the same fields plus a remove button
- Intermediate stops stored in local state array

**Tab 3 — "3. Equipment & Docs"** (Truck icon)
- Total Weight (lbs) number input
- Commodity Description text input
- Equipment Type selector dropdown (Dry Van, Flatbed, Reefer, Step Deck, Power Only)
- File input button styled as an upload area for "Signed Rate Confirmation" attachment (visual only — no actual upload wiring)

**Footer**: Always visible below the tabs
- "Cancel" ghost button → calls `onCancel` prop
- "Save Active Load" primary button → calls `onSave` prop with form data

**Props**: `onSave(data)`, `onCancel()`, optional `initialData` for edit mode

**State**: Local `useState` for all fields; no react-hook-form library needed (plain controlled inputs as used throughout the existing codebase). Autocomplete uses a filtered list + Popover/Command pattern from shadcn.

**Icons**: Building2 (broker), DollarSign (rate), MapPin (route), Truck (equipment), Plus (add stop), Upload (file), X (remove stop)

### File: `src/pages/FleetLoads.tsx` (Modify)
- Import `IndependentLoadBuilder`
- When `isIndependent` and the Add Load dialog opens, render `IndependentLoadBuilder` instead of the default 6-tab form
- Wire `onSave` to the existing `handleSubmit` mutation, mapping the broker-focused fields to the `fleet_loads` columns
- Wire `onCancel` to close the dialog

### Technical notes
- No new dependencies — uses existing shadcn/ui components and Lucide icons
- Autocomplete uses shadcn Command + Popover (already in the project)
- The component follows the same controlled-input pattern as the existing form in FleetLoads
- Intermediate stops are UI-only for now (stored in state, passed in `onSave` payload for future DB support)

