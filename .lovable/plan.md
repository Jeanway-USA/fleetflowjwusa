

## Refine Advances: Only Contractor Statement Pre-Trip with Load Numbers

### Problem
Advances are being duplicated because both the Card Activity PDF and Contractor Statement report the same cash advances/pre-trips. This inflates the advances total, making it look like the driver took all profit. The Contractor Statement is the authoritative source for per-load advances.

### Changes

**`src/lib/settlement-reconciliation.ts`**

1. **Store the source file type on each collected expense** — change the `source` field to also track `sourceType` (the `StagedFile['type']` value like `contractor_pdf`, `card_activity_pdf`, etc.)

2. **Refine advance bucketing logic** (lines 221-228) — instead of putting all `is_advance` items into the advances bucket:
   - Only items from `contractor_pdf` source that match Pre-Trip/Card Pre-Trip patterns AND have a `trip_number` go into advances
   - All other `is_advance` items are **dropped** (not imported as expenses or advances — they are duplicates of the contractor statement's authoritative record)

3. **Remove overly broad fallback patterns** — trim `ADVANCE_FALLBACK_PATTERNS` to only detect Pre-Trip patterns. Remove `CASH_ADVANCE`, `CARD_LOAD`, `DIRECT.?DEPOSIT` from fallback since we no longer want those in the advances bucket at all.

4. **Ensure trip_number is linked** — the `findMatchingLoad` function in `ReconciliationPreview.tsx` already matches trip numbers to loads, so advances with trip numbers will automatically get load links. No changes needed there.

### Logic Summary
```text
Before: ALL is_advance items from ALL sources → advances bucket
After:  ONLY Pre-Trip items from Contractor Statement WITH trip_number → advances bucket
        Everything else marked is_advance → excluded (not imported)
```

### Files Modified
- `src/lib/settlement-reconciliation.ts`

