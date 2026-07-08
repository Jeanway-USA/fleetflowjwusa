## Goal
Collapse the Finance page's 8 sub-tabs into a 3-button pipeline (**Run Payouts · Tax & Compliance · Analytics & Audit Logs**) with the metric bar pinned on top. No data or hooks are removed — everything is remapped into one of the three views.

## 1. File edits

### `src/pages/Finance.tsx`

- **Keep untouched**: PageHeader, period/truck selectors, the 4 summary cards (Net Revenue, Net Expenses, Net Profit, Equipment Debt), all queries/mutations, all dialogs (upload / expense form / mass edit / delete confirms).
- **Replace lines 658–1019** (the `<Tabs>` block with 8 triggers + 8 `TabsContent` bodies) with a new `<Tabs>` block containing exactly 3 triggers styled as a segmented control:
  - `payouts` → **1. Run Payouts**
  - `compliance` → **2. Tax & Compliance**
  - `analytics` → **3. Analytics & Audit Logs**
- Persist the selection to the URL as `?view=payouts|compliance|analytics` (reuse existing `useSearchParams`). Default to `payouts`.
- Segmented-control styling: `TabsList` gets `grid grid-cols-3 gap-2 p-1 bg-muted rounded-lg`; each `TabsTrigger` uses `data-[state=active]:bg-background data-[state=active]:shadow-sm` with a numbered label.

### View 1: Run Payouts (`TabsContent value="payouts"`)
Stack, in order:
1. `<ActiveBatchTab />` — already the W-2 salary grid ($2,000 base default, editable Bonus / Holiday / FIT, live `Net = (Base+Bonus+Holiday) − (EE Tax + FIT)`).
2. Divider heading "Truist ACH Staging" (a section header, not a nested tab), then `<TruistAchStagingTab />` rendered directly beneath, so finalizing above flows straight into staging below.
3. `<DriverSettlementsTab />` for 1099 / contractor pay (kept in the same view because it's part of the "run payouts" pipeline).
4. `<CommissionsTab .../>` for agent commissions.
- `canManagePayroll` gate: the ActiveBatch + Truist sections are wrapped in `canManagePayroll` so non-privileged users only see the contractor settlements and commissions below.

### View 2: Tax & Compliance (`TabsContent value="compliance"`)
Just `<TaxFilingRegistryTab />` (which already has the Overdue/Due/Completed matrix + Void/Exempt archive built last turn). Wrapped in `canManagePayroll`; other roles get a small "Payroll admin only" empty state.

### View 3: Analytics & Audit Logs (`TabsContent value="analytics"`)
Stack, in order:
1. `<PLSummaryTab .../>` (rolling P&L)
2. `<Suspense><RevenueTab .../></Suspense>` (revenue charts)
3. `<Suspense><LoadProfitabilityTab .../></Suspense>` (margins)
4. `<AuditReconciliation loads={loads} />`
5. **Historical Expenses** card — the entire Expenses table + Expense Breakdown card block currently in the Expenses tab (lines 718–971) moved verbatim.
6. **Invoicing & Factoring** — the current Invoicing tab body (independent-mode gated) moved verbatim.
7. **Compensation & Safety Bonus Settings** — the current Settings tab body (`CompensationSettingsTab` + `SafetyBonusSettings`) moved verbatim.

### `src/components/finance/inhouse-payroll/InHousePayrollWorkspace.tsx`
- Delete file. Nothing else imports it after the Finance rewrite; grep confirms only `src/pages/Finance.tsx` references it.

## 2. Driver-facing isolation
No changes under `src/components/drivers/` or `src/components/driver/`. All work is scoped to `src/pages/Finance.tsx` and one deleted workspace wrapper.

## Technical notes
- The Equipment Debt card stays as-is: it already sums `trucks.monthly_payment` for active loan trucks (the $1,793 the user mentioned is the current computed total, not a hardcoded literal). No change needed.
- View state URL key `view` avoids clashing with any existing search params on the page. If none is present we default to `payouts`.
- Existing `TabsContent` inner JSX blocks are moved as-is — no logic edits — so all filters, sorting, pagination, dialogs continue to work.
- The Run Payouts view's Truist section reads the same `internal_payroll_ledger` rows the Active Batch writes; the "handshake" is already automatic through query invalidation.

## Out of scope
- No changes to the tax engine or ledger schema (last turn's migration covers it).
- No consolidation of ActiveBatch + Truist into a single grid — they remain two visually separated sections in the same view per the spec's "secondary layout window" language.
- No removal of any query, mutation, or supporting UI dialog.
