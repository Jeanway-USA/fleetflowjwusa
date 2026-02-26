

## Fix: App YTD Revenue to Match Net Revenue (Remove Advance Logic)

### Problem

The 1099 Audit "App YTD Revenue" uses `settlement ?? net_revenue` while the Finance summary card "Net Revenue" uses `net_revenue`. These should be the same value. Additionally, the reconciliation formula incorrectly treats Card/Cash Advances as additional revenue to be added to the app total. Advances are pre-payments against existing load revenue — they are not separate income and should not be summed on top.

### Changes Required

**File: `src/components/finance/AuditReconciliation.tsx`**

1. **App YTD calculation** (line 55): Change from `l.settlement ?? l.net_revenue ?? 0` to `l.net_revenue ?? 0` so it matches the Net Revenue summary card exactly.

2. **Load-by-load table settlement column** (line 75): Same change — use `l.net_revenue ?? 0` for the per-load and cumulative amounts.

3. **Gap analysis "Missing Settlement" card** (line 64): Update condition to check `!l.net_revenue` instead of `!l.settlement && !l.net_revenue`.

4. **Remove Card Advance additions from reconciliation formula** (lines 176-185): Remove the "Adjusted App" line that adds card advances to the total, and remove the "Remaining Gap" that uses the inflated number. The formula should simply compare Landstar 1099 vs App Net Revenue directly. Keep the Card/Cash Advances line as informational context only (not added to the total).

5. **Gap analysis card label** (line 158): Change "Missing Settlement" to "Missing Net Revenue" to match the updated logic.

6. **Formula text** (line 178): Update from `fleet_loads.settlement (or net_revenue)` to `fleet_loads.net_revenue`.

7. **Table header** (line 209 area): Change "Settlement" column header to "Net Revenue" for clarity.

### What stays the same

- Card/Cash Advances gap analysis card remains visible as informational context
- The variance calculation (Landstar vs App) stays the same structure but now compares against `net_revenue` only
- Load-by-load breakdown table structure unchanged

