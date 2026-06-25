
# Statement Reconciliation & Discrepancy Halt

Layer flat-rate validation on top of the existing statement upload pipeline. When parsed carrier statement rates disagree with `fleet_loads.rate`, halt the settlement, flag the load row red on the Active Loads Board, and write a queryable line-error to a new audit table.

## 1. Database migration

New table + one column.

```sql
-- settlement_discrepancies
id uuid PK, org_id uuid, load_id uuid NULL FK fleet_loads, settlement_id uuid NULL FK driver_settlements,
trip_number text NULL, expected_amount numeric, actual_amount numeric, delta_amount numeric,
reason_code text  -- 'trip_rate_mismatch' | 'period_total_mismatch'
detail text NULL, resolved_at timestamptz NULL, created_at timestamptz default now()
```
- GRANTs: `SELECT,INSERT,UPDATE,DELETE` to `authenticated`; `ALL` to `service_role`.
- RLS: org-scoped via `get_user_org_id(auth.uid())`; only owners/payroll_admin can write.

Columns added:
- `fleet_loads.has_statement_discrepancy boolean default false`
- `driver_settlements.status` enum extended to allow `'discrepancy'` (text column today — just a value).

## 2. Edge function parser changes — `supabase/functions/parse-landstar-statement/index.ts`

- Remove `REVENUE_IGNORE_PATTERNS` filtering for linehaul/flat-rate lines.
- Extend prompt + JSON schema with `revenue` array:
  ```
  revenue: [{ trip_number, flat_rate, reimbursement_total, description, date }]
  ```
- Still strip TRIP% ESCROW PAYMENT and other deductions per existing rules.

## 3. Client reconciliation engine — `src/lib/settlement-reconciliation.ts`

Add `reconcileRevenue(parsed, existingLoads)` producing:
```ts
{ tripMismatches: [...], periodTotal: { expected, actual, delta }, hasBlockingDiscrepancy: boolean }
```
- **Pass 1 (per-trip)**: join `revenue[i].trip_number` → `fleet_loads.landstar_load_id`. Flag if `|expected − actual| > $1.00`.
- **Pass 2 (period total)**: sum unmatched + all-period revenue, compare to `Σ fleet_loads.rate` for loads with `delivery_date ∈ [period_start, period_end]`. Flag if `|Δ| > $5.00`.
- Within-tolerance variance is silently absorbed (display = statement value).

## 4. Reconciliation UI — `src/components/finance/ReconciliationPreview.tsx`

- New "Rate Reconciliation" section above the existing expense table listing each mismatch (trip #, expected, actual, Δ) in destructive styling.
- If `hasBlockingDiscrepancy`, disable the Import / Approve button, show inline alert: "Settlement halted — resolve N discrepancies before import."
- On import, write each mismatch to `settlement_discrepancies` and set `fleet_loads.has_statement_discrepancy = true` for affected loads.

## 5. Active Loads Board — `src/components/dispatch/ActiveLoadsBoard.tsx`

- Pull `has_statement_discrepancy` in the loads query.
- Render a red `STATEMENT MISMATCH` badge on the affected row (destructive variant, AlertTriangle icon).
- Clicking opens the load detail with a new "Statement Discrepancies" section listing rows from `settlement_discrepancies` for that `load_id`.

## 6. Settlements tab — `src/components/finance/SettlementsTab.tsx` + `driver-settlements/SettlementDetailSheet.tsx`

- Settlements with `status = 'discrepancy'` render a red banner + locked Generate/Approve actions.
- Detail sheet adds a "Line Errors" panel that queries `settlement_discrepancies` by `settlement_id` (trip #, expected, actual, Δ, reason).
- Owner / payroll_admin can mark a discrepancy resolved (`resolved_at = now()`), which clears the lock if no unresolved rows remain.

## Files

**New**
- `supabase/migrations/<ts>_settlement_discrepancies.sql`
- `src/hooks/useSettlementDiscrepancies.ts`
- `src/components/finance/StatementDiscrepancyPanel.tsx`

**Edited**
- `supabase/functions/parse-landstar-statement/index.ts` (capture revenue lines)
- `src/lib/settlement-reconciliation.ts` (revenue reconcile + tolerance)
- `src/components/finance/StatementUpload.tsx` (pass loads through; surface block)
- `src/components/finance/ReconciliationPreview.tsx` (mismatch UI + writeback + halt)
- `src/components/finance/SettlementsTab.tsx` + `driver-settlements/SettlementDetailSheet.tsx`
- `src/components/dispatch/ActiveLoadsBoard.tsx` (red badge + detail panel)

## Out of scope

- No changes to escrow/advance handling (existing rules stay).
- No auto-resolution of mismatches — admins resolve manually.
- No changes to `generate_driver_settlements` RPC; halt is enforced at import + at approve in the UI layer.
