

# Account for Fuel Discounts in IFTA Reporting

## Problem

The system has "Fuel Discount" expenses (NATS discounts) like:
- "NATS Discount: OH765 PERRYSBURG OH" -- $92.47
- "NATS Discount: CO254 WHEAT RIDGE CO" -- $47.79
- "NATS Discount: TX859 AMARILLO TX" -- $44.26

These discounts reduce the actual fuel cost paid in each state, but IFTA reporting currently ignores them entirely. The Jurisdiction Summary map shows inflated fuel costs per state because the NATS discounts are not subtracted.

## Solution

Three changes to properly account for fuel discounts:

### 1. Include Fuel Discounts in the Sync Flow

Update the "Sync from Expenses" button logic in IFTA.tsx to also process "Fuel Discount" expenses:
- Expand the expense type filter from `['Fuel', 'DEF']` to `['Fuel', 'DEF', 'Fuel Discount']`
- Parse the jurisdiction from the NATS description format (e.g., extract "OH" from "NATS Discount: OH765 PERRYSBURG OH")
- When syncing a Fuel Discount, set its `jurisdiction` field so the database trigger creates a corresponding `fuel_purchases` record with a **negative** total_cost and zero gallons

### 2. Parse NATS Discount Descriptions for State Detection

Add a helper function to extract the state code from NATS-style descriptions:
- Pattern: "NATS Discount: XX### CITY ST" -- the last two-letter word is typically the state
- Falls back to the existing `extractJurisdictionFromVendor` for non-NATS formats
- This will be used during sync and also for auto-suggesting jurisdictions in the unsynced expenses list

### 3. Show Fuel Discounts in the Unsynced Expenses Section

Update the unsynced expenses query to also include "Fuel Discount" expenses that lack a jurisdiction:
- These appear alongside unsynced Fuel/DEF expenses in the "Expenses Missing Jurisdiction" card
- The description column will show the NATS info so users can identify the state
- Users can manually assign a jurisdiction if auto-detection fails

### 4. Account for Discounts in Jurisdiction Summary

The JurisdictionMap component already aggregates `fuelCost` from fuel_purchases. Once discounts are synced as negative-cost fuel purchases, the map will automatically show the net fuel cost per state (gross fuel cost minus discounts). No changes needed to the map component itself -- it will work correctly once the data flows through.

## Technical Details

### Files to Modify

**src/pages/IFTA.tsx**
- Update `syncFuelFromExpenses`: expand expense type filter to include `'Fuel Discount'`; add description-based state parsing for NATS discounts
- Update `unsyncedExpenses` query: include `'Fuel Discount'` in the expense type filter
- Add a `extractStateFromDescription` helper that parses patterns like "NATS Discount: OH765 PERRYSBURG OH"

**src/components/ifta/UnsyncedExpenses.tsx**
- Add a `description` field to the interface and display it in the table (NATS discounts have no vendor, but their description contains the location info)
- Show the description in a new column so users can identify where the discount applies

### Data Flow

```text
Fuel Discount expense (e.g., "NATS Discount: CO254 WHEAT RIDGE CO", $47.79)
    |
    v
Sync parses description -> extracts "CO" as jurisdiction
    |
    v
Updates expense.jurisdiction = "CO"
    |
    v
DB trigger creates fuel_purchases record:
  - jurisdiction: "CO"
  - total_cost: 47.79 (stored as positive, will be treated as discount)
  - gallons: 0
  - vendor: "NATS Discount"
    |
    v
Jurisdiction Summary map shows CO fuel cost reduced by $47.79
```

### Important Note on Sign Convention

The NATS discount expenses store amounts as positive numbers (e.g., 92.47). In the Finance page they are already flagged as refund/credit via the `isRefundExpense` function. For IFTA, these will sync as fuel_purchases with **zero gallons** and a **negative total_cost** so they correctly reduce the net fuel cost per state. The sync logic will negate the amount when creating the fuel_purchases record for Fuel Discount type expenses.

