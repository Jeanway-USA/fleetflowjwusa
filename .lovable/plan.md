

## Upgrade Settlements Tab for Landstar BCO Operations

Redesign the settlements experience with Landstar-specific deduction fields, a professional ledger-style settlement sheet, and direct PDF import integration.

---

### 1. Database Migration -- Add Itemized Deduction Columns

Add 6 new nullable numeric columns (defaulting to 0) to the `settlements` table for Landstar BCO-specific deductions:

| Column | Description |
|--------|-------------|
| `lcn_satellite_fees` | LCN/Satellite communication fees |
| `prepass_scale_fees` | PrePass/Scale bypass fees |
| `insurance_liability` | Unladen liability insurance |
| `trailer_rental` | Trailer lease/rental payment |
| `plates_permits` | Plates, permits, registration |
| `cpp_benefits` | CPP/Benefits deductions |

```sql
ALTER TABLE settlements
  ADD COLUMN lcn_satellite_fees numeric DEFAULT 0,
  ADD COLUMN prepass_scale_fees numeric DEFAULT 0,
  ADD COLUMN insurance_liability numeric DEFAULT 0,
  ADD COLUMN trailer_rental numeric DEFAULT 0,
  ADD COLUMN plates_permits numeric DEFAULT 0,
  ADD COLUMN cpp_benefits numeric DEFAULT 0;
```

No RLS changes needed -- existing policies already cover the table.

---

### 2. Frontend: Expanded Settlement Interface and Form

**Update `src/components/finance/SettlementsTab.tsx`:**

**Settlement interface** -- Add all 6 new fields to the TypeScript `Settlement` interface and the `formData` defaults.

**Create/Edit Dialog** -- Replace the current 4-field "Deductions" section with a 2-column grid of all deduction inputs organized into two groups:

- **Standard Deductions**: Fuel Advances, Cash Advances, Escrow
- **Landstar BCO Deductions**: LCN/Satellite, PrePass/Scale, Insurance/Liability, Trailer Rental, Plates/Permits, CPP/Benefits, Other Deductions

The **Net Pay** calculation at the bottom updates to sum all 9 deduction fields (existing 4 + new 5 + other_deductions).

**Settlements Table** -- The "Deductions" column already shows total deductions; it will now sum all 9 fields.

---

### 3. Frontend: Professional Ledger-Style Settlement Sheet

**Redesign the "View Settlement" Sheet** (`SheetContent`) to mirror a traditional BCO settlement statement with three distinct sections:

**Section 1 -- Header**
- Driver name, settlement period, status badge
- Compact header with company branding feel

**Section 2 -- Gross Revenue**
- Revenue line items from `settlement_line_items` (loads)
- Subtotal row with bold green text

**Section 3 -- Itemized Deductions**
- Every deduction field shown as a ledger row in red text with leading minus sign
- Only non-zero deductions are displayed (keeps it clean)
- Categories grouped: "Advances", "Recurring Deductions", "Other"
- Each line: left-aligned label, right-aligned red amount
- Subtotal row for total deductions

**Section 4 -- Net Pay**
- Double-bordered final row, large bold text
- Clear visual separation (double line above)

Style: Monospace-influenced font sizing for amounts, tight spacing (`py-1`), alternating subtle backgrounds, high-contrast red for deductions and green/primary for revenue.

---

### 4. Import Landstar PDF Integration

Add an **"Import Landstar PDF"** button inside the Create/Edit Settlement dialog (alongside "Auto-Generate from Loads"). When clicked:

1. Opens a file picker for PDF upload
2. Converts to base64 and calls `parse-landstar-statement` edge function via `supabase.functions.invoke()`
3. On success, maps the parsed expense categories to settlement deduction fields:
   - `Fuel` expenses -> `fuel_advances`
   - `Cash Advance` -> `cash_advances`
   - `Escrow Payment` -> `escrow_deduction`
   - `LCN/Satellite` -> `lcn_satellite_fees`
   - `PrePass/Scale` -> `prepass_scale_fees`
   - `Insurance` -> `insurance_liability`
   - `Trailer Payment` -> `trailer_rental`
   - `Licensing/Permits` + `Registration/Plates` -> `plates_permits`
   - `CPP/Benefits` -> `cpp_benefits`
   - Everything else -> `other_deductions`
4. Also sets `period_start` and `period_end` from the parsed statement if available
5. Shows a toast with the extraction summary

This reuses the same edge function already used by `StatementUpload.tsx` -- no backend changes needed.

---

### 5. Files Changed

| File | Action |
|------|--------|
| `supabase/migrations/...sql` | New migration adding 6 columns |
| `src/components/finance/SettlementsTab.tsx` | Major rewrite: expanded interface, new form fields, ledger sheet, PDF import |

No new files needed. No edge function changes.

