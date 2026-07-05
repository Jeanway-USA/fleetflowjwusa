## W-2 Driver Sync Dashboard

Add a new dashboard on **Settings → Payroll** that lists all W-2 company drivers, syncs them to Gusto, and shows the status of their onboarding forms (W-4 / I-9).

Per your answer, the gross-pay-only / drop-deductions helper will **not** be built — drivers need to see itemized deductions on their settlements.

### New file
- `src/components/payroll/W2DriverSyncDashboard.tsx`
  - shadcn `Card` + `Table` layout, TanStack Query fetches drivers filtered to `employment_type = 'w2_company'` (Independent Owner-Operator rows are excluded at the query level and never rendered).
  - Columns: Name, Email, Gusto ID (or "Not synced"), **Document Status** badge, Action.
  - **Sync to Gusto** button per row → calls existing `sync_employee` action (already POSTs `/v1/companies/{uuid}/employees` and persists `gusto_employee_id`). Button hides once the driver has a `gusto_employee_id`.
  - **Document Status** badge states:
    - `Not synced` (gray) — no `gusto_employee_id` yet
    - `Forms pending` (amber) — synced but W-4 or I-9 not signed
    - `Forms complete` (green) — both W-4 and I-9 signed
    - `Unknown` (gray outline) — Gusto returned no onboarding data
  - Refresh button re-queries both drivers table and Gusto onboarding status.
  - Empty state: "No W-2 company drivers. Switch a driver's employment type to W-2 to see them here."

### Edited files
- `supabase/functions/run-w2-payroll/index.ts`
  - Add `get_employee_onboarding_status` action: `GET /v1/employees/{employee_uuid}/onboarding_status`, returns a compact `{ employee_uuid, w4_signed, i9_signed, onboarding_completed }` shape derived from Gusto's `onboarding_steps` (matches `federal_tax_setup` and `state_tax_setup` / `employee_form_signing` step keys).
  - Batch variant `get_employees_onboarding_status` that accepts `employee_uuids: string[]` and returns an array — used by the dashboard so we make one function call instead of N.
- `src/services/gustoCompanyApi.ts`
  - Add `syncEmployeeToGusto(driverId)` and `getEmployeesOnboardingStatus(uuids)` service wrappers around the two edge-function actions.
- `src/pages/Settings.tsx`
  - Mount `<W2DriverSyncDashboard />` inside `TabsContent value="payroll"`, placed above `<PayrollTaxesCard />` and `<PayScheduleManager />` (sync is the prerequisite step, so it goes first).

### Explicitly NOT doing
- **No gross-only settlements helper.** Per your decision, drivers keep full deduction visibility; we won't add a function that strips deduction line items.
- No changes to the existing `DriverSettlementsTab` — settlements continue to show full detail.
- No new DB migrations (uses existing `drivers.gusto_employee_id`).

### Technical notes
- W-2 filter is applied server-side in the Supabase query (`.eq('employment_type', 'w2_company')`) so Independent OO drivers never enter the client.
- Sync button uses optimistic UI with a spinner and toast; on success invalidates the drivers query so the row reflects the new Gusto ID and re-fetches onboarding status.
- Onboarding-status query is `enabled` only when at least one driver has a `gusto_employee_id`.
- All Gusto network calls stay inside the edge function; the client never touches Gusto directly.
