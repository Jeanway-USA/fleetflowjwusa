# Settlements UI: Type Tabs + Manual Edit Mode

## 1. Driver-type tabs — `DriverSettlementsTab.tsx`

- Extend the existing `Driver` shape to include `employment_type` and add it to the `drivers` select.
- Add a new `typeFilter` state: `'all' | 'w2' | 'contractor'`.
- Render a row of pill buttons above the existing status filter:
  - **All** → no filter
  - **W-2 Company Payroll** → `employment_type === 'w2_company'`
  - **1099/Lease Settlements** → `employment_type` in `('1099_contractor', 'lease_purchase')`
- Combine with the existing status filter inside the `filtered` memo (filter by driver's employment_type via `driverMap`).
- Visual style: matches the current status `Button` pills, sitting on its own row.

## 2. Edit Settlement mode — `SettlementDetailSheet.tsx`

- Add a new "Edit Settlement" button in the sheet header (next to Preview / Download). Visible only when `settlement.status === 'draft'` (matches existing editability rule). Toggles a local `editMode` boolean. Label flips to "Done Editing" when active.
- Pass `editMode` down to `LineItemsSplit` → `LineItemColumn` alongside the existing `editable` flag. Rows become editable only when **both** `editable` (draft) AND `editMode` (user opted in) are true — preserves current read-only-by-default UX.
- When `editMode` is on, each existing row swaps its plain text cells for:
  - Description: `<Input>` bound to local row state, seeded from `r.description`.
  - Amount: `<Input type="number" step="0.01">` bound to local row state, seeded from `|r.amount|`.
  - Inline **Save** icon button (CheckIcon) appears beside the trash icon when the row has unsaved local changes.
- Add `updateMut` in `LineItemColumn` calling:
  ```ts
  supabase.from('driver_settlement_items')
    .update({ description, amount })
    .eq('id', rowId)
  ```
  then `rpc('recalc_settlement_totals', { _settlement_id })`, then invalidate the same query keys as `addMut`/`delMut`.
- Toast: `Line item updated`.

## 3. Inline row creation — already present, polish only

The "+ Add Manual Line Item" workflow already exists at the bottom of both columns with description + amount inputs and per-row trash buttons. Two small refinements so it matches the spec exactly:

- Make the "+ Add Manual Line Item" trigger more visibly button-like (dashed border + clearer hover state) instead of the current subtle link-style row, so users see it at a glance on both grids.
- Ensure the trash icon (already present on saved rows via `delMut`) is also shown on the unsaved-in-progress add form so users can dismiss the pending row with the same affordance, not just a "Cancel" text button. The Cancel button stays as the keyboard fallback.

No backend / schema changes — `driver_settlement_items` already supports insert/update/delete and the `recalc_settlement_totals` RPC already exists.

## Out of scope

- No change to how drafts auto-recalc on the server.
- No new aggregation, no new tabs other than the three specified.
- W-2 vs contractor totals still come from the existing recalc RPC; we are not splitting the totals math.

## Verification

- `tsgo` typecheck.
- Open Finance → Driver Settlements: confirm the three driver-type pills filter the list correctly when combined with the status filter.
- Open a draft settlement → click **Edit Settlement** → confirm description + amount inputs appear inline on existing rows, edits save and update the summary totals.
- Confirm the "+ Add Manual Line Item" button is visible and styled distinctly on both EARNINGS and DEDUCTIONS grids.
