

## Fix: Advances Misclassified from PDF Sources + Ensure Proper Import

### Problem
The PDF edge function (`parse-landstar-statement`) doesn't return `is_advance: true` on its expenses. Items like "Cash Advance", "Card Pre-Trip", and "Direct-Deposit Bank" parsed from Card Activity PDFs arrive without the advance flag, so the reconciliation engine puts them in the "Actual Expenses" bucket instead of "Advances".

### Changes

**1. `supabase/functions/parse-landstar-statement/index.ts` — Add `is_advance` to edge function**
- Add `is_advance: boolean` to the `ExtractedExpense` interface
- Update the AI prompt to instruct it to set `is_advance: true` for Cash Advance, Card Pre-Trip, Card Load, CARD CONT SPEC ADV, and Direct-Deposit items (both fee and bank transfer)
- Update the JSON schema example in the prompt to include `is_advance`

**2. `src/lib/settlement-reconciliation.ts` — Add fallback advance detection**
- After collecting all expenses from all sources, apply advance detection patterns to any item that doesn't already have `is_advance: true`
- Patterns: `/\bCASH\s*ADVANCE\b/i`, `/\bADVANCE\b/i`, `/\bCARD PRE-TRIP\b/i`, `/\bCARD CONT.*SPEC\s*ADV\b/i`, `/\bDIRECT.?DEPOSIT\b/i`, `/\bDD\s*FEE\b/i`, `/\bCARD\s*LOAD\b/i`
- This ensures even if the PDF parser omits the flag, the reconciliation engine catches it

**3. `src/components/finance/ReconciliationPreview.tsx` — Ensure only expenses + credits are counted in totals**
- Already correct: advances are excluded from `netExpense` calculation
- No changes needed here

### Files Modified
- `supabase/functions/parse-landstar-statement/index.ts`
- `src/lib/settlement-reconciliation.ts`

