## Goal
Convert the In-House Payroll workspace from a mostly read-only view into a fully editable, live-recalculating ledger with settlement staging and filing completion tracking.

## 1. Active Payroll Batch Tab — editable cells + live math

File: `src/components/finance/inhouse-payroll/ActiveBatchTab.tsx`

- Replace the read-only currency cells for **Gross Pay** (`gross_line_haul`), **Reimburse** (rename display of `pass_through_fsc` → "Reimburse (FSC)"), **EE Tax** (aggregate), and **ER Tax** (aggregate) with inline number inputs, styled consistently with the existing FIT override input (`h-8 w-24 text-right`, disabled when `status='finalized'`).
- Keep local per-row edit state (`edits: Record<ledgerId, { gross, reimburse, eeTax, erTax, fit }>`) initialized from the query data; live-recompute **Net** on every keystroke as `Net = (Gross + Reimburse) - EE Tax`, shown in the Net column and bolded.
- On blur (or explicit "Save row" button appearing when the row is dirty), persist:
  - `internal_payroll_ledger`: `gross_line_haul`, `pass_through_fsc`, `gross_taxable_pay` (recomputed via `calculateLineHaulBase` from the edited gross/reimburse).
  - `tax_withholding_ledger`: split the entered EE Tax proportionally across `ee_social_security`, `ee_medicare`, `federal_income_withholding` using current ratios (fallback: dump full amount into `federal_income_withholding` when no prior split exists); split ER Tax across `er_social_security`, `employer_medicare`, `tx_twc_unemployment` the same way.
- Add a "Reset row" ghost button per dirty row to discard local edits.
- Invalidate `internal_payroll_ledger` and `tax_withholding_ledger` queries after each save so the Truist tab reflects updated numbers.

## 2. Truist ACH Staging Tab — auto-populate + submit payout

File: `src/components/finance/inhouse-payroll/TruistAchStagingTab.tsx`

- Broaden the current query (already reads all ledgers for the org) but display two visual states:
  - `status='draft'` → badge "Pending Bank Release" (amber).
  - `status='finalized'` → badge "Settled" (green, with Lock icon and locked ACH code text).
- Keep the existing period info column; net payout continues to compute from the linked `tax_withholding_ledger` row so edits made in tab 1 flow through automatically (no extra plumbing — the query already re-runs on invalidation).
- Rename the finalize CTA to **"Submit Payout"** (keep the underlying finalize mutation: insert into `truist_payout_logs`, flip ledger to `finalized`). Keep the ACH code text input required.
- Show a small "Auto-synced from Active Batch" helper line at the top of the card.

## 3. Tax Filing Registry Tab — mark filed & paid

Files:
- `src/components/finance/inhouse-payroll/TaxFilingRegistryTab.tsx`
- New: `src/components/finance/inhouse-payroll/MarkFiledDialog.tsx`
- Migration: new table `tax_filing_completions`.

### Table `public.tax_filing_completions`
Columns: `id uuid pk`, `org_id uuid`, `form_key text` (deterministic key = `${form}|${scope}|${dueDate ISO}`), `confirmation_reference text`, `filed_on date`, `filed_by uuid`, `created_at timestamptz default now()`.
Constraints: unique `(org_id, form_key)`. GRANT to authenticated + service_role; RLS scoped to `org_id = get_user_org_id(auth.uid())` AND `has_payroll_access(auth.uid())`; INSERT-only for authenticated (no UPDATE/DELETE except service_role).

### UI
- Fetch completions with `useQuery(['tax_filing_completions', orgId])`; build a map keyed by `form_key`.
- Add a right-hand "Action" column:
  - If completion exists → green locked `Completed` badge showing `confirmation_reference` + filed date (tooltip).
  - Else → **Mark Filed & Paid** button opening `MarkFiledDialog`.
- `MarkFiledDialog` fields: `Confirmation reference` (text, required, max 100), `Filed on` (date input, defaults today). Submit inserts into `tax_filing_completions`; on success, toast + invalidate query so badge flips to Completed. Zod schema for validation.
- The Overdue / Due-Soon / Upcoming badges continue to render only when no completion exists.

## 4. Driver safety
No changes under `src/components/drivers/` or `src/components/driver/`. All new interactivity is gated inside the `/finance/inhouse-payroll` workspace, which is already `has_payroll_access`-guarded.

## Technical notes
- All Supabase writes include `org_id` explicitly.
- Editable inputs use `type="number" step="0.01"` and clamp negatives at 0.
- Live-net formula uses the currently-edited values (not the DB row) so numbers update without a round-trip.
- Tax split ratios: `if (currentTotal > 0) share = currentField / currentTotal; else share = 0` — leftover after distributing SS/Medicare buckets lands in `federal_income_withholding` (EE side) or `tx_twc_unemployment` (ER side) to preserve totals exactly.
- `form_key` uses ISO due date to remain stable across renders regardless of user locale.

## Out of scope
- No changes to `payCalculations.ts` tax engine.
- No 1099 / W-2 PDF generation.
- No email/webhook notifications on filing completion.
- No editing of `finalized` rows (existing DB trigger already blocks this).
