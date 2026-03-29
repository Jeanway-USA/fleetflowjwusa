

## Plan: Invoice Preview & Edit with Resend

### Overview
Add an in-app invoice preview dialog (rendered HTML, not PDF) that users can view before generating, and an edit capability on sent invoices that updates the data and resends the invoice email. No edge function needed — the invoice is rendered client-side as a printable HTML view.

---

### 1. New Component: `InvoicePreviewDialog.tsx`

Create `src/components/finance/InvoicePreviewDialog.tsx`:

- A `Dialog` that renders a professional invoice using org branding (logo, name, address from AuthContext) and load data (rate, fuel surcharge, accessorials, detention, lumper).
- Accepts props: `load`, `open`, `onClose`, `mode: 'preview' | 'edit'`, `onConfirm`.
- In **preview mode** (pre-send): read-only view with "Generate Invoice" button at the bottom.
- In **edit mode** (post-send): line item amounts become editable `Input` fields. A "Save & Resend" button at the bottom.
- The invoice layout includes: company logo/name header, invoice number, date, bill-to (broker from CRM or load data), itemized line items table, and total.
- Includes a "Print / Download PDF" button that triggers `window.print()` on a print-optimized container.

### 2. Update `InvoicingTab.tsx`

**Pending tab changes:**
- Replace the current "Generate Invoice" button with a "Preview Invoice" button.
- Clicking opens `InvoicePreviewDialog` in `preview` mode.
- Confirming from the preview dialog triggers the existing `generateInvoice` mutation.

**Invoiced tab changes:**
- Add an "Edit" button (Pencil icon) to each invoiced load row.
- Clicking opens `InvoicePreviewDialog` in `edit` mode, with editable line items.
- "Save & Resend" updates the load's rate/fuel_surcharge/accessorials/detention_pay/lumper in `fleet_loads`, updates `invoiced_at` to now, and shows a success toast.

### 3. No Database Changes

The existing `fleet_loads` columns (`invoice_status`, `invoice_number`, `invoiced_at`, `rate`, `fuel_surcharge`, `accessorials`, `detention_pay`, `lumper`) already support everything needed. Editing updates the amounts directly on the load row and refreshes `invoiced_at`.

---

### Files

| File | Action |
|------|--------|
| `src/components/finance/InvoicePreviewDialog.tsx` | Create — invoice preview/edit dialog with print support |
| `src/components/finance/InvoicingTab.tsx` | Edit — wire preview button for pending loads, edit button for invoiced loads |

