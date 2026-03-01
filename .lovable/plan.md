

## Prevent False Deduplication of Recurring Weekly Expenses

### Problem
The dedup key is `${date}_${expense_type}_${amount}`. When the same recurring expense (e.g., "Card Fee" $2.50) appears multiple times on the same date from the same source document, or when multiple line items share the same date/type/amount but are distinct charges, they get incorrectly merged into one.

### Root Cause
Recurring charges like Card Fee, DD Fee, Prepass, LCN Fees, etc. appear on every weekly statement with potentially the same amount. If two such charges land on the same date (or two documents report the same-looking charge that is actually two separate transactions), the engine treats them as duplicates.

### Solution

**`src/lib/settlement-reconciliation.ts`**

1. Define a `RECURRING_EXPENSE_TYPES` set containing expense types that are expected to recur and should not be aggressively deduped:
   - `Licensing/Permits`, `Card Fee`, `Direct Deposit Fee`, `CPP/Benefits`, `LCN/Satellite`, `Truck Warranty`, `PrePass/Scale`, `Trip Scanning`, `Insurance`

2. Update the dedup key logic:
   - For recurring expense types: append the **source label** to the key so the same charge from the same document is kept, and only cross-document matches (same date + type + amount) are merged
   - For non-recurring types: keep existing behavior (merge across sources)
   - Additionally, for ALL types: if the same key appears multiple times from the **same source**, treat each occurrence as distinct by appending a counter

3. Implementation: before the dedup loop, group items by source. Within each source, if multiple items share the same `date_type_amount` key, append an index suffix to make each unique. Then run dedup across sources as before — this way cross-document matches still merge, but same-document duplicates are preserved.

### Files Modified
- `src/lib/settlement-reconciliation.ts`

