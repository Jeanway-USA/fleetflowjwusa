

## Plan: Wire Invoice Emails via Resend

### Overview
Create a `send-invoice-email` edge function that sends branded invoice emails using Resend (already configured with `RESEND_API_KEY`). Wire it into the invoicing flow so emails are sent on generate and on edit/resend. The recipient email is looked up from CRM contacts using the load's `agency_code`.

---

### 1. Edge Function: `supabase/functions/send-invoice-email/index.ts`

- Accepts `load_id` in the request body, authenticated via JWT.
- Fetches load data, org branding (name, logo), and the broker/agent email from `crm_contacts` (matching `agency_code` to `agent_code` field).
- Builds a professional HTML invoice email with: company header, invoice number, load route, line items table (rate, fuel surcharge, accessorials, detention, lumper), and total.
- Sends via Resend using existing `RESEND_API_KEY` and `no-reply@jeanwayusa.com` sender.
- Returns `{ success, recipientEmail }`.

### 2. Update `InvoicingTab.tsx`

- After `generateInvoice` mutation succeeds, call `supabase.functions.invoke('send-invoice-email', { body: { load_id } })`.
- After `updateInvoice` mutation succeeds, call the same function (resend).
- Show toast with recipient email on success, or warning if no broker email found.

### 3. Update `InvoicePreviewDialog.tsx`

- Add a "Bill To" section showing the broker name/email from CRM (fetched via a query on `crm_contacts` filtered by `agent_code` matching the load's `agency_code`).
- Allow manual email override input if no CRM contact is linked.

---

### Files

| File | Action |
|------|--------|
| `supabase/functions/send-invoice-email/index.ts` | Create — Resend-based invoice email sender |
| `src/components/finance/InvoicingTab.tsx` | Edit — invoke edge function after generate/update |
| `src/components/finance/InvoicePreviewDialog.tsx` | Edit — add Bill To section with broker info |

