Give drivers a click-to-expand breakdown of the accessorials behind every total they see — on the Load Detail dialog and on the Paystub dialog.

### Scope
Two driver surfaces, frontend-only. No schema or business-logic changes.

1. `src/components/driver/ActiveLoadCard.tsx` — Load Detail dialog
2. `src/components/driver/MyPaystubsDialog.tsx` — Paystub detail view

`DriverPayWidget` already has the desired collapsible accessorials breakdown for weekly pay — leave it as-is.

### 1. Load Detail dialog (ActiveLoadCard)

Currently the detail dialog shows a single "Estimated Pay" row with no breakdown. Drivers can't see where accessorials come from.

- Widen the local `Load` interface so `load_accessorials` carries `{ id, accessorial_type, amount, notes }` (the parent `DriverDashboard` query already pulls `load_accessorials(*)`, so no fetch change needed).
- Below the "Estimated Pay" row, render a shadcn `Collapsible` titled "Accessorials" only when `load.load_accessorials?.length > 0`.
  - Trigger row shows the icon, label "Accessorials", a `Badge` with the summed `$X.XX`, and a chevron that rotates on open (mirror the styling used in `DriverPayWidget`).
  - Content lists each accessorial: title-cased `accessorial_type` (replace `_` with space), optional `notes` as subtext, and the formatted amount on the right.
  - Empty/zero case: hide the section entirely.
- Sum is computed locally from `load.load_accessorials`, matching `sumAccessorials` in `payCalculations.ts` so totals stay consistent with `estimatedPay`.

### 2. Paystub dialog (MyPaystubsDialog)

The selected paystub card currently shows Base Pay, Bonus, and Net Pay — no accessorial visibility. Drivers must call dispatch to verify.

- Add a `useQuery` (enabled only when a paystub is selected) keyed by `['paystub-accessorials', selected.id]` that:
  - Pulls delivered `fleet_loads` for `driver_id = driverId` with `delivery_date` in `[period_start, period_end]`, selecting `id, landstar_load_id, load_accessorials(id, accessorial_type, amount, notes)`.
  - Flattens to a list of `{ loadId, loadNumber, accessorial_type, amount, notes }` and computes the total.
- Inside the selected-paystub layout, between the base/bonus rows and the Net Pay block, insert an `Accessorials` `Collapsible` when items exist:
  - Trigger shows label + total badge + chevron.
  - Content lists each accessorial with `#loadNumber`, type, optional notes, and amount right-aligned.
  - When loading, show a small skeleton row; when empty, omit the section.
- The Net Pay value is not changed — settlement totals are already authoritative. The breakdown is informational transparency.

### Verification
- Open a driver's Load Details dialog with a load that has 2+ accessorials → section appears, total matches `Estimated Pay - base`, items expand/collapse.
- Open a driver's paystub from `My Paystubs` for a period with accessorials → new "Accessorials" collapsible lists each line item from delivered loads in the period and sums correctly.
- Loads/paystubs without accessorials show no new UI (no empty section).
- Mobile: collapsible rows wrap and respect existing 48px touch target spacing.