# Driver Classification & Lease-Purchase UI

Expose the existing `drivers.employment_type` enum and `lease_purchase_agreements` table through the driver add/edit form and the profile sheet.

## 1. Employment Type dropdown — `src/pages/Drivers.tsx` (edit dialog)

Add a new "Classification" section above the existing "Pay Information" block:

- shadcn `Select` labeled **Employment Type**, bound to `formData.employment_type`
- Options (enum values → labels):
  - `w2_company` → "W-2 Company Driver"
  - `contractor_1099` → "1099 Contractor"
  - `lease_purchase` → "Lease-Purchase"
- Default new drivers to `w2_company` (matches DB default) inside `openDialog`.
- Persisted via existing `createMutation` / `updateMutation` (already spread `formData`).

Verify the exact enum string values via `select enum_range(null::employment_type_enum)` before wiring; map UI labels to whatever values the enum reports (likely `w2_company`, `contractor_1099`, `lease_purchase`).

## 2. Lease-Purchase Agreement sub-form

When `formData.employment_type === 'lease_purchase'`, render an inline `Card` titled **"Lease Purchase Agreement Configuration"** with three numeric inputs:

- **Weekly Fixed Lease Amount ($)** → `weekly_lease_amount` (step `0.01`)
- **Maintenance Escrow Rate Per Mile ($)** → `escrow_cpm_rate` (step `0.0001`, placeholder `0.10`)
- **Weeks Remaining on Agreement** → `total_weeks_remaining` (integer)

Held in local `leaseForm` state, seeded from a new query:

```ts
useQuery(['lease-agreement', editingDriver?.id], () =>
  supabase.from('lease_purchase_agreements')
    .select('*').eq('driver_id', editingDriver.id).eq('status','active')
    .maybeSingle())
```

On submit (only when employment_type is `lease_purchase`):
- If no active row exists → `insert` with `driver_id`, `org_id`, the three fields, `status:'active'`, `current_escrow_balance: 0`.
- If row exists → `update` the three fields by `id`.
- Run after the driver create/update succeeds, then invalidate `['lease-agreement', driverId]` and `['drivers']`.

If user switches OFF lease_purchase on an existing lease driver, leave the row intact (status preserved) — do not auto-archive. We are only adding visible controls.

## 3. Escrow ledger badge — `src/components/drivers/DriverDetailSheet.tsx`

Below the existing Credentials & Compliance section (or directly under the contact strip when `driver.employment_type === 'lease_purchase'`):

- Fetch active lease agreement for the driver via TanStack Query (same query shape as above).
- Render a small panel:
  - Label: "Current Escrow Pool Balance"
  - Value: formatted USD (`formatCurrency(current_escrow_balance)`) inside a prominent `Badge` (variant `secondary`, larger text)
  - Subtext: `Weekly Lease $X • $Y/mi escrow • N weeks remaining`
- Read-only. Hidden when no active agreement OR when employment_type is not `lease_purchase`.

Also surface a tiny `Badge` next to the driver name showing the employment type label (W-2 / 1099 / Lease) so the classification is always visible at a glance.

## Out of scope

- No schema changes, no new tables, no RLS edits — the backend is already in place.
- No automatic escrow ledger postings (settlement engine already handles that).
- No bulk migration of existing drivers.

## Verification

- `tsgo` typecheck.
- Manually open the Add Driver dialog, select Lease-Purchase, confirm the sub-card appears and saves.
- Open an existing lease driver's profile sheet and confirm the escrow balance badge renders with seeded data.
