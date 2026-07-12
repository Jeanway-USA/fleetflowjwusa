## Goal

On the Finance page, replace step 2 (Tax & Compliance) with the Expenses section currently living in step 3 (Analytics & Audit Logs), so step 3 is decluttered and step 2 becomes the dedicated expenses hub.

## Changes (all in `src/pages/Finance.tsx`)

1. **Rename step 2 tab**
   - Change `TabsTrigger value="compliance"` label from `2. Tax & Compliance` to `2. Expenses`.
   - Keep the `value="compliance"` key so the existing `?view=compliance` route stays valid (no router changes required).

2. **Replace step 2 content**
   - Remove the `TaxFilingRegistryTab` block from `<TabsContent value="compliance">`. The Tax Filing Registry already lives in `/admin/tax-hub` (Federal tab) from the recent Tax Hub build, so nothing is lost.
   - Move the entire Expenses UI (the "Track expenses by type…" Card at ~lines 772–1032, including the toolbar, filters, sortable table, pagination, bulk-edit/delete, and the Add/Edit/Upload dialogs) from `<TabsContent value="analytics">` into `<TabsContent value="compliance">`.
   - Expense dialogs (`expenseDialogOpen`, `massEditDialogOpen`, `massDeleteDialogOpen`, `uploadDialogOpen`, `ConfirmDeleteDialog` for single delete) are rendered at the page root already — no change needed for those.

3. **Declutter step 3 (Analytics & Audit Logs)**
   - After removing the Expenses card, step 3 keeps only: `PLSummaryTab`, `RevenueTab`, `LoadProfitabilityTab`, and `AuditReconciliation`. These are the true analytics/audit surfaces.

4. **No changes to**
   - Expense queries, mutations, filters, or state (`filteredExpenses`, `sortedFilteredExpenses`, etc.) — they're declared at page scope and already flow into both tabs.
   - `Finance.tsx` URL param handling.
   - Tax Hub, Payroll, or any other component/file.

## Out of scope
- No backend/migration changes.
- No changes to the Expenses UI itself — this is a pure relocation + tab rename.
