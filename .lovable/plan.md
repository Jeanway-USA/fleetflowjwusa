

## Plan: Auto-Sync Fuel Expenses to IFTA Fuel Purchases

### Problem
When fuel expenses are added through the load expenses panel or imported via Landstar statement on the Finance page, they only go into the `expenses` table. The IFTA Reporting page reads from a separate `fuel_purchases` table, so fuel data must be manually entered twice. This plan eliminates that duplication.

### Approach
Add a `jurisdiction` (state) field to the expenses table and all fuel entry points. Then use a database trigger to automatically sync Fuel/DEF expenses into the `fuel_purchases` table whenever they are created or updated.

---

### Part 1: Database Changes

**Add `jurisdiction` column to `expenses` table:**
- New nullable `text` column for the US state code (e.g., "TX", "GA")
- Only relevant for Fuel and DEF expense types

**Create a database trigger function `sync_fuel_expense_to_ifta()`:**
- Fires on INSERT and UPDATE on the `expenses` table
- When `expense_type` is "Fuel" or "DEF":
  - Computes `price_per_gallon` from `amount / gallons` (if gallons > 0)
  - Upserts a matching row into `fuel_purchases` using a source reference pattern (stores `expense_id` in a new notes-based lookup or a dedicated `source_expense_id` column on `fuel_purchases`)
  - Maps fields: `expense_date` to `purchase_date`, `amount` to `total_cost`, `gallons`, `vendor`, `jurisdiction`, `truck_id`
  - For the `driver_id`, looks up the driver from the linked load (`fleet_loads.driver_id`) if `load_id` is set
- When an expense is DELETED, removes the corresponding `fuel_purchases` record
- Skips sync if `jurisdiction` is null (IFTA requires a state)

**Add `source_expense_id` column to `fuel_purchases` table:**
- Nullable UUID column to link back to the originating expense
- Allows the trigger to find and update/delete the matching IFTA record
- Unique constraint to prevent duplicate syncs

---

### Part 2: Update ExpensesList Component (Load Expenses)

**File:** `src/components/shared/ExpensesList.tsx`

- Add a `jurisdiction` field to the form state
- Show a state selector dropdown (US states list) when expense type is "Fuel" or "DEF"
- Pass `jurisdiction` in the expense insert payload
- The database trigger handles the rest automatically

---

### Part 3: Update Finance Page Expense Form

**File:** `src/pages/Finance.tsx`

- Add `jurisdiction` to the expense dialog form
- Show the state selector when creating/editing Fuel or DEF expenses
- Include `jurisdiction` in create and update mutations

---

### Part 4: Update Landstar Statement Import

**File:** `src/components/finance/StatementUpload.tsx`

- The Landstar parser already extracts vendor locations which often contain state info
- Add a `jurisdiction` field to the `ExpenseWithMatch` interface
- During import, attempt to infer the state from the vendor name/description (common patterns like "PILOT DALLAS TX" or "TA FORT WORTH TX")
- Include `jurisdiction` in the expense insert payload
- The database trigger will automatically create the `fuel_purchases` record

---

### Part 5: Update IFTA Page

**File:** `src/pages/IFTA.tsx`

- Add a visual indicator on fuel purchases that were auto-synced from expenses (via `source_expense_id`)
- These auto-synced records should still be editable on the IFTA page for jurisdiction corrections

---

### Data Flow Diagram

```
Expense Added (any entry point)
    |
    v
expenses table INSERT/UPDATE
    |
    v
[DB Trigger: sync_fuel_expense_to_ifta]
    |
    +-- Is Fuel or DEF?
    |       |
    |       +-- Has jurisdiction?
    |       |       |
    |       |       v
    |       |   UPSERT into fuel_purchases
    |       |   (linked via source_expense_id)
    |       |
    |       +-- No jurisdiction -> Skip IFTA sync
    |
    +-- Not Fuel/DEF -> Skip
```

---

### Technical Summary

| Action | File/Location | Details |
|--------|--------------|---------|
| Migration | New SQL migration | Add `jurisdiction` to `expenses`, add `source_expense_id` to `fuel_purchases`, create sync trigger |
| Modify | `src/components/shared/ExpensesList.tsx` | Add state selector for Fuel/DEF expenses |
| Modify | `src/pages/Finance.tsx` | Add state selector to expense dialog for Fuel/DEF |
| Modify | `src/components/finance/StatementUpload.tsx` | Extract/include jurisdiction on imported fuel expenses |
| Modify | `src/pages/IFTA.tsx` | Show sync indicator on auto-created records |

No new components needed. The database trigger ensures every entry point (load expenses, finance page, Landstar import) automatically syncs to IFTA without any additional frontend logic.

