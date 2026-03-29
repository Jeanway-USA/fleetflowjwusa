

## Plan: Enhanced Revenue Details, Broker CRM Integration & Invoice Itemization

### Overview
The existing schema already has `rate` (linehaul), `fuel_surcharge`, `accessorials`, `detention_pay`, `lumper` on `fleet_loads`, plus an itemized `load_accessorials` table. We need to add a `negotiation_notes` field, make the load form mode-aware, show broker avg rate/mile stats, add revenue category breakdowns to Finance charts, and itemize accessorials on invoices.

---

### 1. Database Migration

Add one new column:
```sql
ALTER TABLE fleet_loads ADD COLUMN negotiation_notes text DEFAULT NULL;
```

No other schema changes needed — `rate`, `fuel_surcharge`, `accessorials`, `detention_pay`, `lumper`, and the `load_accessorials` table already exist.

---

### 2. Load Form — Mode-Aware Revenue Tab (`FleetLoads.tsx`)

Currently the Revenue tab shows all fields (linehaul, FSC, lumper, accessorials) for all modes. Update it:

**Landstar mode**: Simplify to show just "Rate" and "FSC" inputs, since revenue is percentage-based from the carrier settlement. Hide the dynamic accessorials builder.

**Independent mode**:
- Keep all existing inputs (Line Haul, FSC, Lumper).
- Keep the existing dynamic accessorials list (already built with Type + Amount).
- Add a **"Total Negotiated Rate"** live calculator below the inputs showing `rate + fuel_surcharge + accessorialsTotal + lumper`.
- Add a **"Negotiation Notes"** textarea field — saved to `fleet_loads.negotiation_notes`.
- Add a **"Rate Confirmation Upload"** shortcut button inside the Revenue tab that scrolls to / triggers the existing `RateConfirmationUpload` component.

Use `useOrganizationMode()` hook to conditionally render.

---

### 3. Broker CRM Integration (`FleetLoads.tsx`)

When in Independent mode and the load has a broker linked (via `agency_code`):
- Query `fleet_loads` for all delivered loads with the same `agency_code`.
- Calculate and display a small info card showing:
  - **Avg Rate/Mile** for that broker (sum of `gross_revenue` / sum of `booked_miles`).
  - **Total loads** with that broker.
- Display this inside the Revenue tab when `agency_code` is set, as a "Broker Rate History" badge.

---

### 4. Finance Revenue Breakdown (`RevenueTab.tsx`)

The Revenue tab already shows Linehaul, FSC, and Accessorials columns per load. Enhance it:
- Add a **summary card row** at the top showing total Line Haul vs FSC vs Accessorials as separate metrics.
- Add a simple **bar or pie breakdown** showing the proportion of Line Haul vs FSC vs Accessorials revenue. Use a lightweight visual (colored progress bars or a small recharts pie).
- Only show the breakdown for Independent mode; Landstar mode keeps the current simple table.

---

### 5. Invoice Itemization (`InvoicePreviewDialog.tsx`)

Currently the invoice shows fixed `LINE_ITEM_KEYS` (rate, fuel_surcharge, accessorials, detention, lumper). Update to:
- Fetch itemized accessorials from `load_accessorials` table for the load.
- Replace the single "Accessorials" line with individual rows per accessorial (e.g., "Detention — $150.00", "Layover — $200.00").
- Keep Line Haul and FSC as top-level items.
- Remove `detention_pay` and `lumper` from the static list since they'll come through as accessorials (or keep them if they have values and no matching accessorial record, for backward compat).

Also update the `send-invoice-email` edge function HTML template to render itemized accessorials.

---

### Files

| File | Action |
|------|--------|
| Migration SQL | Add `negotiation_notes` column to `fleet_loads` |
| `src/pages/FleetLoads.tsx` | Mode-aware Revenue tab, negotiation notes field, broker rate history card |
| `src/components/finance/RevenueTab.tsx` | Add revenue category breakdown summary for independent mode |
| `src/components/finance/InvoicePreviewDialog.tsx` | Fetch and display itemized accessorials instead of single line |
| `supabase/functions/send-invoice-email/index.ts` | Update HTML template to itemize accessorials |

