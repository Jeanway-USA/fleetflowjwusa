

## Plan: Factoring System for Independent Mode

### Overview
Add factoring configuration, a factoring portal tab, and super admin enhancements. This enables independent operators to bundle invoiced loads into factoring submissions and track funding status.

---

### 1. Database Migration

**A. Add columns to `organizations`:**
```sql
ALTER TABLE organizations ADD COLUMN factoring_enabled boolean DEFAULT false;
ALTER TABLE organizations ADD COLUMN factoring_fee_percentage numeric DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN factoring_remit_address text DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN factoring_provider_name text DEFAULT NULL;
```

**B. Add columns to `fleet_loads`:**
```sql
ALTER TABLE fleet_loads ADD COLUMN factoring_status text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN factoring_submission_id text DEFAULT NULL;
```

**C. Update `super_admin_organizations` view** to include `factoring_enabled`, `factoring_provider_name`.

---

### 2. Factoring Settings — `CompanyTab.tsx`

- Visible only when `isIndependent`.
- New card section "Factoring Settings" with:
  - Toggle: "Enable Factoring" → saves `factoring_enabled` on `organizations`.
  - Input: "Factoring Fee %" → saves `factoring_fee_percentage`.
  - Input: "Factoring Company Name" → saves `factoring_provider_name`.
  - Textarea: "Notice of Assignment / Remit To Address" → saves `factoring_remit_address`.
- Fetches current values from the org query already in the component, saves via direct update to `organizations`.

---

### 3. Invoice Notice of Assignment — `InvoicePreviewDialog.tsx` & `formatters.ts`

- In `InvoicePreviewDialog`, query `factoring_enabled`, `factoring_provider_name`, and `factoring_remit_address` from `organizations`.
- If factoring is enabled, append a footer section to the invoice: **"Notice of Assignment: Pay to [Factoring Provider Name]"** followed by the remit address.
- Add a `formatNoticeOfAssignment(providerName, remitAddress)` helper to `formatters.ts` that returns the formatted text string.

---

### 4. Factoring Portal Tab — `src/components/finance/FactoringTab.tsx`

New component with:
- **Summary cards**: Pending Submission count, Submitted count, Funded total, Avg Factoring Fee.
- **"Ready to Submit" section**: Shows invoiced loads where `factoring_status IS NULL`. Checkboxes for multi-select. A "Bulk Submit to Factoring" button that:
  - Generates a `factoring_submission_id` (batch ID like `FACT-YYYYMMDD-XXXX`).
  - Updates selected loads: `factoring_status = 'submitted'`, sets `factoring_submission_id`.
  - Shows toast confirmation.
- **"Submitted" section**: Shows loads with `factoring_status = 'submitted'`. Each row has a "Mark as Funded" button that:
  - Sets `factoring_status = 'funded'`.
  - Calculates net after factoring fee: `total * (1 - fee_percentage / 100)`.
  - Displays the net amount in a "Funded Amount" column.
- **"Funded" section**: Shows completed factoring with amounts.
- **Download package**: A "Download Submission Package" button per batch that opens each load's invoice in print view (reuses `InvoicePreviewDialog`).

**Finance page update** (`Finance.tsx`):
- Add `<TabsTrigger value="factoring">Factoring Portal</TabsTrigger>` next to invoicing (both guarded by `isIndependent`).
- Add corresponding `<TabsContent>` with `<FactoringTab />`.

---

### 5. Super Admin — `OrgDetailSheet.tsx`

- Add to "Business Configuration" section:
  - **Factoring Provider**: Show `factoring_provider_name` if set, or "Not configured".
  - **Total Invoiced**: Query count of `fleet_loads` where `invoice_status = 'invoiced'` for the org (via a simple display, not a new RPC — the org detail sheet already has org context).
- The existing "Impersonate Org" button in `OrgActionsDropdown` already provides login-as-user capability, so no new button is needed here.

---

### Files

| File | Action |
|------|--------|
| Migration SQL | Create — add factoring columns to `organizations` and `fleet_loads`, update view |
| `src/components/settings/CompanyTab.tsx` | Edit — add Factoring Settings section for independent mode |
| `src/lib/formatters.ts` | Edit — add `formatNoticeOfAssignment` helper |
| `src/components/finance/InvoicePreviewDialog.tsx` | Edit — append Notice of Assignment footer when factoring enabled |
| `src/components/finance/FactoringTab.tsx` | Create — factoring portal with bulk submit, mark funded, batch tracking |
| `src/pages/Finance.tsx` | Edit — add Factoring Portal tab for independent mode |
| `src/components/superadmin/OrgDetailSheet.tsx` | Edit — show factoring provider and invoice volume |

