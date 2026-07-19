## Agency Loads: wrapped cells, two-tier primary cells, expandable rows

Reuses the same `wrapCells` + `expandable` + `renderExpanded` + `renderMobileCard` support already added to `DataTable` for Fleet Loads. No component changes.

### Note on fields (verified against `agency_loads` schema)

The table doesn't currently store dedicated agent-contact, percentage-split, tracking-variable, or commodity columns. Available columns: `load_reference`, `broker_name`, `carrier_name`, `broker_rate`, `carrier_rate`, `margin`, `origin`, `destination`, `pickup_date`, `delivery_date`, `pickup_at`, `delivery_at`, `pickup_tz`, `delivery_tz`, `status`, `notes`.

I'll map the request onto those fields: "Agency" = `broker_name`, "Carrier" = `carrier_name`, "split/pay details" = broker rate / carrier rate / margin / margin %. If you want first-class Agent Contact / Commodity / Tracking columns, that's a follow-up schema change I'll flag at the end.

### Primary (always-visible) columns

1. **Load** — two-tier: `load_reference` in mono/semibold, `broker_name` (agency) muted underneath. Wraps.
2. **Agency / Carrier** — two-tier: `broker_name` on top, `carrier_name` muted underneath (falls back to "Unassigned carrier"). Wraps.
3. **Origin** — City, ST on top; ZIP muted underneath (reusing the same `formatAddressDisplay` helper as Fleet Loads, moved into a small shared util or duplicated locally in this page). Wraps.
4. **Destination** — same treatment as Origin. Wraps.
5. **Status** — `StatusBadge` pill.
6. **Margin** — top-right stacked: dollar margin + margin % of broker rate.
7. **Actions** — dropdown (Edit / Archive), unchanged.

The existing standalone `broker_name`, `carrier_name`, `broker_rate`, `carrier_rate` columns are removed from the top-level table (their data moves into the two-tier cells and the expanded row) to save horizontal room.

### Expanded row (via `renderExpanded`)

Grid of label/value chips (2 cols on mobile, 4 on desktop):

- Broker rate, Carrier rate, Margin, Margin %
- Pickup date + time (formatted with `pickup_tz` when present)
- Delivery date + time (formatted with `delivery_tz` when present)
- Load reference (full, for copyability)
- Notes (full-width, `whitespace-pre-wrap`) when set

Click anywhere on a row toggles expansion (same pattern as Fleet Loads); double-click still opens the edit dialog; bulk-selection and archive stay intact.

### Mobile (`renderMobileCard`)

Card layout matching Fleet Loads:

1. Header row: `load_reference` (mono semibold) + `StatusBadge` + actions dropdown.
2. Agency + Carrier stacked (bold agency, muted carrier).
3. From / To rows with city/state and zip muted underneath.
4. Bottom row: margin dollar (colored) · margin % · pickup date.

### Files touched

- `src/pages/AgencyLoads.tsx` — rewrite `columns` array, add `wrapCells`, `expandable`, `renderExpanded`, and `renderMobileCard`; add a local `formatAddressDisplay` helper mirroring Fleet Loads.

### Out of scope / follow-up

- No schema changes. If you want dedicated **Agent Contact (name/phone/email)**, **Commodity**, and **Tracking ID** fields on agency loads, I'll do that as a separate migration + form update — say the word and I'll queue it.
- No changes to the create/edit dialog, other pages, or shared `DataTable`.
