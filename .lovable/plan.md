## What's wrong

The Jul 10–16 settlement for Timothy Ames shows **$1,153.54** in the Generated Statements list but **$1,593.54** in the Settlement detail panel.

Verified in the database for that settlement:
- gross_pay 2000.00, reimbursements 0, deductions 406.46, tax_withholding 440.00
- `net_pay` is a generated column: `gross_pay + reimbursements - deductions - tax_withholding` = **1153.54** (correct, and what the list shows)

The detail sheet computes its own net locally and leaves tax withholding out entirely:
`currentNet = currentGross + currentReimb - currentDed` → 1593.54. Same bug for the YTD block (`ytdNet`). The printable statement already handles `tax_withholding` correctly, so the detail sheet is the only view out of sync.

## Fix

In `src/components/finance/driver-settlements/SettlementDetailSheet.tsx`:

1. Read `tax_withholding` (and the YTD withholding equivalent, if stored) from the settlement row.
2. Stop computing net locally — use the stored `settlement.net_pay` for the Net Pay card, falling back to the full formula including withholding.
3. Add a **Tax Withholding** tile alongside Gross / Reimbursements / Deductions so the four numbers visibly add up to Net Pay.
4. Update the "Calculation Note" line to read `Net Pay = Gross Pay + Reimbursements − Deductions − Tax Withholding`.
5. Apply the same treatment to the Year-to-Date (Proof of Income) block so YTD Net matches.

No database or business-logic changes — the stored values are already correct; only this panel's presentation is wrong.

## Note (not part of this fix)

This settlement has manual `Federal Income Tax` ($253.46) and `FICA EE` ($153.00) deduction line items *and* an automatic 22% W-2 withholding ($440). That looks like taxes are being taken twice for this driver. Happy to look into the withholding policy separately if you want.
