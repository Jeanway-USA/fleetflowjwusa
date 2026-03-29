

## Plan: Persist Invoice Recipient Email

### Overview
Add an `invoice_email` column to `fleet_loads` so the recipient email is saved with each invoice. On edit, pre-populate from the saved email. The edge function checks this saved email before falling back to CRM lookup.

---

### 1. Database Migration
```sql
ALTER TABLE fleet_loads ADD COLUMN invoice_email text DEFAULT NULL;
```

### 2. `InvoicingTab.tsx`
- In `generateInvoice` mutation, save `invoice_email` alongside other invoice fields (using the override email or broker email returned from the dialog).
- In `updateInvoice` mutation, also update `invoice_email`.
- Pass the email through from `handleDialogConfirm`.

### 3. `InvoicePreviewDialog.tsx`
- On open in edit mode, pre-populate `emailOverride` from `load.invoice_email` if it exists.
- This lets users see which email was previously used and change it if needed.

### 4. `send-invoice-email/index.ts`
- Accept optional `override_email` as before.
- Add fallback chain: `override_email` → `load.invoice_email` → CRM lookup.
- After sending, update `fleet_loads.invoice_email` with the actual recipient used.

---

### Files

| File | Action |
|------|--------|
| Migration SQL | Add `invoice_email` column to `fleet_loads` |
| `src/components/finance/InvoicingTab.tsx` | Save `invoice_email` in generate/update mutations |
| `src/components/finance/InvoicePreviewDialog.tsx` | Pre-populate override from `load.invoice_email` on edit |
| `supabase/functions/send-invoice-email/index.ts` | Use saved `invoice_email` in fallback chain, persist after send |

