

## Audit Mode for Finance Expenses Tab

### Problem
Landstar reports $22,873.37 in Year-to-Date 1099 Earnings, but the website's tracked revenue may differ. There's no tool to identify where the discrepancy lies -- missing loads, different amounts, or untracked adjustments.

### Understanding the Data
From the Landstar Contractor Statement, "1099 Earnings" is the sum of all revenue line items (Tractor L/H at driver %, Fuel Surcharge at 100%, accessorials, layovers, stop-offs, etc.). In the app, this maps to the `settlement` or `net_revenue` field on `fleet_loads`. The audit mode needs to compare these two sources.

### Solution: Audit Reconciliation Card

Create a new `AuditReconciliation.tsx` component rendered at the top of the Expenses tab (above the StatementUpload). It provides:

**1. Input Section**
- A numeric input where the user enters the Landstar YTD 1099 figure (e.g., $22,873.37)
- A year selector (defaults to current year 2026)
- A toggle button "Enable Audit Mode" that expands the panel

**2. YTD Summary Comparison**
- **Landstar YTD 1099**: The user-entered value
- **App YTD Revenue**: Sum of `settlement` (or `net_revenue` if settlement is null) from all `fleet_loads` where `pickup_date` falls within the selected year
- **Variance**: Difference between the two, highlighted green if matching, red if mismatched
- Show variance as both dollar amount and percentage

**3. Load-by-Load Breakdown Table**
- Lists every load in the year, sorted by pickup_date
- Columns: Date, Landstar Load ID, Origin -> Destination, Rate, FSC, Accessorials, Gross Revenue, Settlement (what the app has as 1099-equivalent), Status
- Running cumulative total column so user can see at what point the numbers diverge
- Highlight loads that have no `settlement` value or where settlement = 0 (potential missing data)

**4. Gap Analysis Section**
- "Loads without settlement values" count
- "Loads in non-delivered status" that might be pending
- Total of Card Pre-Trips / advances that may be included in Landstar's 1099 but tracked differently in the app
- Cross-reference: sum of `expenses` with type "Card Load" or "Cash Advance" for the year (these are included in Landstar's 1099 calculation as advances against revenue)

**5. Reconciliation Formula Display**
Shows the math clearly:
```
Landstar 1099 = Sum of (Tractor L/H % + FSC + Accessorials + Card Pre-Trips)
App Total     = Sum of fleet_loads.settlement (or net_revenue)
Difference    = Landstar 1099 - App Total
```

### Technical Approach

- All data is already queried in `Finance.tsx` (loads, expenses, trucks)
- The component receives `loads` and `expenses` as props, filters to YTD internally
- No new database queries needed -- purely a client-side calculation/display component
- User-entered Landstar YTD value stored in component state (not persisted)

### Files Changed

| File | Action |
|------|--------|
| `src/components/finance/AuditReconciliation.tsx` | Create -- new audit comparison component |
| `src/pages/Finance.tsx` | Edit -- render AuditReconciliation at top of expenses tab, pass loads/expenses props |

