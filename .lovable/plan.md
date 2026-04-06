

## Loan & Financing Management for Trucks

### 1. Database Migration
Add 6 new nullable columns to the `trucks` table:

```sql
ALTER TABLE public.trucks
  ADD COLUMN loan_balance numeric DEFAULT NULL,
  ADD COLUMN monthly_payment numeric DEFAULT NULL,
  ADD COLUMN interest_rate numeric DEFAULT NULL,
  ADD COLUMN loan_term_months integer DEFAULT NULL,
  ADD COLUMN loan_start_date date DEFAULT NULL,
  ADD COLUMN lender_name text DEFAULT NULL;
```

No RLS changes needed -- existing truck policies already cover these columns.

### 2. Trucks Page - Edit/Add Dialog (`src/pages/Trucks.tsx`)

**Financing section in the form** (after the driver assignment section, before DialogFooter):
- Add a collapsible "Financing" section with a `Landmark` (bank) icon header
- Fields in a 2-column grid: Lender Name, Loan Balance, Monthly Payment, Interest Rate (%), Loan Term (months), Loan Start Date
- Display a computed "Estimated Payoff Date" (loan_start_date + loan_term_months) as read-only text below the fields
- Update `toEditableTruck()` to include the 6 new fields
- Update `formData` state handling for the new fields

**Loan badge on the data table**:
- Add a new column after the Status column called "Loan"
- If `loan_balance > 0`, show a small badge with the formatted remaining balance (e.g. `$42,500`)
- If no loan, show a muted dash

**Truck Details dialog** (the "View Details" dialog):
- Add a third tab "Financing" alongside Expenses and Documents
- Show a read-only card with lender name, balance, monthly payment, rate, term, start date, and calculated payoff date

### 3. Finance Page - Equipment Debt Widget (`src/pages/Finance.tsx`)

Add a 4th summary card in the existing grid (change from `md:grid-cols-3` to `md:grid-cols-4`):
- Title: "Equipment Debt"
- Icon: `Landmark` (bank icon)
- Value: sum of `monthly_payment` from all active trucks (status = 'active') that have a non-null monthly_payment
- Subtitle: "X trucks with active loans"

The trucks query already exists on the Finance page (line 138-145), so we just need to compute the aggregate from the existing data. The new columns will be available once the migration runs.

### 4. Types
The `src/integrations/supabase/types.ts` file auto-regenerates after migration -- no manual edit needed.

### Files Changed
| File | Change |
|------|--------|
| New migration SQL | Add 6 columns to `trucks` |
| `src/pages/Trucks.tsx` | Financing form section, loan badge column, financing details tab |
| `src/pages/Finance.tsx` | Equipment Debt summary card |

