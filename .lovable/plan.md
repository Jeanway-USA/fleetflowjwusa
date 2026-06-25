## Goal
Overhaul the existing **Finances → Driver Settlements** tab to match the simplified model (Gross + Reimbursements = Net, no advances/deductions), with a polished generation modal and per-row PDF download.

## 1. Database migration

`driver_settlements`:
- Drop `fuel_advances`, `deductions`, `bonus_pay`, `ytd_deductions` (and the `net_pay` generated column that depends on them).
- Re-add `net_pay` as `gross_pay + reimbursements` (stored generated).
- Add `ytd_reimbursements numeric not null default 0`.
- Keep `period_start`, `period_end`, `payment_date`, `gross_pay`, `reimbursements`, `ytd_gross`, `ytd_net`, `status`, `generated_by`, `generated_at`, unique `(org_id, driver_id, period_end)`.

`driver_settlement_items.item_type` → restrict to `'load_pay' | 'reimbursement'`.

## 2. Replace `generate_driver_settlements(_driver_ids uuid[], _period_end date, _payment_date date)`

For each target driver (specific IDs, or all active when `_driver_ids` is null):
1. `period_start = max(prior period_end)+1`, else earliest delivered load, else `hire_date`, else `1900-01-01`.
2. **Gross Pay** — aggregate delivered `fleet_loads` in the window by driver `pay_type` (percentage × org truck split, per-mile × actual/booked miles, or flat), plus driver-pay accessorials + fuel surcharge passthroughs.
3. **Reimbursements** — sum `expenses` joined to driver via load, where `expense_type IN ('Reimbursement','Parking','Tolls','Scale','Lumper','Fuel Discount')` (absolute value).
4. Skip drivers with zero activity. Insert settlement (`status='draft'`) + itemized rows.
5. Recompute YTD over `period_end >= date_trunc('year', _period_end)`: `ytd_gross`, `ytd_reimbursements`, `ytd_net`.

`SECURITY DEFINER`, gated by `is_owner` OR `payroll_admin`.

## 3. Tab UI (`DriverSettlementsTab.tsx`)

Table columns become exactly: **Driver · Pay Period · Gross Pay · Reimbursements · Net Pay · Status · Actions**.

Row dropdown actions: **Download PDF**, View Details, Approve / Mark Paid / Revert, Delete.

Status filter chips and the prominent **Generate Settlements** button stay in the header.

## 4. Generate Settlements modal (`GenerateSettlementsDialog.tsx`)

Rebuild as:

- **Drivers**: searchable multi-select combobox (shadcn `Popover` + `Command` + `CommandInput`/`CommandList`), with a sticky **"Select all active drivers"** row at the top. Selected drivers render as removable chips above the trigger. No separate "All drivers" checkbox — "Select all" simply toggles every active driver into the selection.
- **Pay Period End Date**: shadcn date-picker (Popover + Calendar with `pointer-events-auto`), defaults to today.
- **Payment Date**: shadcn date-picker, defaults to the **upcoming Thursday** (today if today is Thursday, else the next Thursday).
- Primary button uses `LoadingButton` and is disabled while `generate.isPending` to prevent duplicate submits; Cancel is also disabled during processing.
- Validation: must have ≥1 driver selected and both dates set, else inline error + toast.

## 5. Settlement detail sheet (`SettlementDetailSheet.tsx`)

- Summary block: **Gross · Reimbursements · Net Pay** (drop Deductions / Fuel-Advances tiles).
- YTD block: **YTD Gross · YTD Reimbursements · YTD Net**.
- Two item tables: **Earnings** (load_pay) and **Reimbursements** (reimbursement). Drop the "Deductions & Advances" section.
- Header gains a **Download PDF** button (same generator used by the table row action).

## 6. PDF generation

New `src/lib/pdf/generateSettlementPdf.ts` using `jspdf` (already installed) + `jspdf-autotable` (new dep).

Layout (US Letter):

```text
+---------------------------------------------------------------+
| [LOGO] {Org Name}              |  Driver: {Name}              |
|        {Org address if set}    |  Pay Period: {start} – {end} |
|                                |  Payment Date: {paymentDate} |
+---------------------------------------------------------------+
|                SETTLEMENT STATEMENT                            |
+---------------------------------------------------------------+
| EARNINGS                                                       |
| Date | Load # | Origin → Destination | Miles | Rate | Amount  |
+---------------------------------------------------------------+
| REIMBURSEMENTS                                                 |
| Date | Type | Description | Amount                             |
+---------------------------------------------------------------+
| CURRENT PERIOD            |  YEAR-TO-DATE                      |
| Gross  $...               |  YTD Gross  $...                   |
| Reimb. $...               |  YTD Reimb. $...                   |
| NET    $...               |  YTD Net    $...                   |
+---------------------------------------------------------------+
| Footer: generated timestamp + page n of N                      |
+---------------------------------------------------------------+
```

Filename: `Settlement_{LastName}_{period_end}.pdf`. Triggered from the row dropdown and from the detail sheet header.

## 7. Files touched

- `supabase/migrations/<new>.sql`
- `src/components/finance/driver-settlements/DriverSettlementsTab.tsx`
- `src/components/finance/driver-settlements/GenerateSettlementsDialog.tsx`
- `src/components/finance/driver-settlements/SettlementDetailSheet.tsx`
- `src/lib/pdf/generateSettlementPdf.ts` (new)
- `package.json` (add `jspdf-autotable`)

## 8. QA

After generating a real settlement: render the PDF, convert with `pdftoppm -r 150`, eyeball every page for clipped text, table overflow, missing logo, and YTD math. Iterate until clean.

## Note on the reimbursement list

I'm classifying these expense types as reimbursements: **Reimbursement, Parking, Tolls, Scale, Lumper, Fuel Discount**. All other expense types are excluded from the settlement entirely. Tell me to adjust if your books use a different list.
