
## Goal

Add `src/components/payroll/PayScheduleManager.tsx` — a card that lets a payroll admin create a Gusto company pay schedule and assign it (individually or in bulk) to synced W-2 drivers. Mount it as a new section on the Payroll tab in `/settings`.

## Files

**New**
- `src/components/payroll/PayScheduleManager.tsx` — the full UI (form + driver list).

**Edited**
- `src/services/gustoCompanyApi.ts` — add two service calls:
  - `createPaySchedule({ frequency, anchorPayDate, anchorEndOfPayPeriod, customName? })`
  - `assignEmployeePaySchedule({ employeeUuid, payScheduleUuid })`
- `supabase/functions/run-w2-payroll/index.ts` — add matching handlers:
  - `create_pay_schedule` → `POST /v1/companies/{uuid}/pay_schedules` with `{ frequency, anchor_pay_date, anchor_end_of_pay_period, custom_name? }`. Response includes the new `uuid`, which is returned to the client.
  - `assign_employee_pay_schedule` → `PUT /v1/companies/{uuid}/employees/{employee_uuid}/pay_schedule` with `{ pay_schedule_uuid }` (version fetched via prior GET on the employee if Gusto requires it).
- `src/pages/Settings.tsx` — render `<PayScheduleManager />` inside the existing `TabsContent value="payroll"`, below `PayrollTaxesCard`.

## Component UI

Uses shadcn `Card`, `Form`, `Select`, `Popover` + `Calendar` (per project datepicker guidance with `pointer-events-auto`), `Button`, `Table`, `Badge`, and `sonner` toasts.

### Form: Create pay schedule

- **Frequency** — `Select`, required:
  - `Every week` → `Every week`
  - `Every other week` → `Every other week`
  - `Twice per month` → `Twice per month`
  - `Monthly` → `Monthly`
- **Anchor pay date** — shadcn date picker, required.
- **Anchor end of pay period** — shadcn date picker, required. Zod check: must be ≤ anchor pay date.
- **Custom name** (optional text).
- Submit `Create pay schedule` → calls `createPaySchedule`. On success:
  - Toast "Pay schedule created".
  - Store the returned schedule uuid + a short summary in local state so the driver list can use it.
  - Append the schedule to an in-memory "Recent schedules" chip row (helps user see the active target).

### Driver list

- Fetches synced W-2 drivers via TanStack Query:
  ```ts
  supabase.from('drivers')
    .select('id, first_name, last_name, gusto_employee_id, employment_type')
    .eq('employment_type', 'w2_company')
    .not('gusto_employee_id', 'is', null)
    .order('last_name');
  ```
  (Same shape used in `RunW2PayrollDialog.tsx` — RLS already restricts by org.)
- Renders a `Table` with columns: checkbox, Name, Gusto ID (muted), Action.
- Header shows:
  - Bulk-select checkbox.
  - "Assign selected to schedule" button — disabled until at least one driver is selected AND a pay schedule has been created this session.
  - "Assign all synced" button (per user's answer) — same disabled logic as bulk but ignores individual selection and targets all rows.
- Each row's Action button "Assign" calls `assignEmployeePaySchedule` for that driver.
- Per-driver loading state; success toast per row; row shows a "Assigned" `Badge` after success so it's obvious what's done. Bulk actions run sequentially and show one aggregate toast (`X assigned, Y failed`).
- Empty state: card-styled message "No synced W-2 drivers yet — sync employees on the Payroll dashboard first." with a link to `/settings/payroll-setup`.

### Empty schedule state
If no schedule has been created yet, the driver-list assign buttons are visible but disabled with tooltip "Create a pay schedule first."

## Endpoint mapping

| UI action | Edge action | Gusto endpoint |
|---|---|---|
| Create pay schedule | `create_pay_schedule` | `POST /v1/companies/{uuid}/pay_schedules` |
| Assign employee to schedule | `assign_employee_pay_schedule` | `PUT /v1/companies/{uuid}/employees/{employee_uuid}/pay_schedule` |

## Technical details

- All Gusto calls stay in the edge function; the browser never sees a bearer token.
- Frequency values are sent to Gusto verbatim (`Every week`, `Every other week`, `Twice per month`, `Monthly`) — matches Gusto's documented enum, so no mapping layer needed.
- Dates are serialized as `format(date, 'yyyy-MM-dd')` (project standard) before hitting the edge action.
- Assign flow tolerates Gusto's optimistic-locking `version` field: edge handler does a GET on the employee's current pay-schedule assignment first and includes `version` in the PUT body if present.
- No database migration needed — schedule uuids live only in Gusto; the Settings page holds the "last created schedule" in local component state for the session. (Follow-up work could persist it, but that's out of scope.)
- No changes to `PayrollSetup.tsx` — user asked for Settings placement.

## Out of scope

- Listing/editing existing Gusto pay schedules.
- Persisting the created schedule uuid in our own DB.
- Removing an assignment or supporting effective-date-based reassignment.
