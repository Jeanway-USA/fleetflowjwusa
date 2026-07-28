## Problem

The Multi-State tab of the Tax Hub crashes with `object is not iterable (cannot read property Symbol(Symbol.iterator))`. The stack points at the `useMemo` aggregation in `MultiStateTab` (`src/pages/admin/TaxHub.tsx`, ~lines 202-233).

That block does:

```
for (const l of d.internal_payroll_ledger ?? []) { ... }
for (const w of l.tax_withholding_ledger ?? []) { ... }
```

Nested embeds from the data API return an **array** for one-to-many relations but a **single object** (or `null`) when the relation is detected as one-to-one (e.g. a unique/PK foreign key). `?? []` only guards `null`/`undefined`, not an object — so a `for...of` over the object throws exactly this error. `tax_withholding_ledger` is the likely culprit; `internal_payroll_ledger` can hit it too.

## Fix

In `src/pages/admin/TaxHub.tsx`:

1. Add a tiny local helper that coerces an embed to an array:
   - `null`/`undefined` → `[]`
   - array → itself
   - single object → `[obj]`
2. Use it for both `d.internal_payroll_ledger` and `l.tax_withholding_ledger` in the aggregation loop.
3. Scan the rest of the file for other `for...of` / `.map()` over nested embeds (the Federal, W-2 and 1099 tabs) and apply the same coercion where a nested relation is iterated, so the same crash can't reappear on a sibling tab.

## Verification

Load `/admin/tax-hub`, open the Multi-State tab, confirm it renders the per-state table with no error boundary, and check the console is clean.
