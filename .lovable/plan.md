## Finance Hub Redesign

Refresh the layout of `src/pages/Finance.tsx` and tweak a few related widgets so the page feels less cluttered, while keeping every existing table component, data flow, and styling completely untouched internally.

### 1. Header & "Upload Statement" modal

In `src/pages/Finance.tsx`:
- Replace the current `<PageHeader title="Finance & P/L" ... />` with a new header titled **"Financial Hub"** and description "Revenue, expenses, profitability, and payouts in one place."
- Add an `Upload Statement` button (with `Upload` icon) into the header `action`/`children` slot.
- Add a new `uploadDialogOpen` state. Clicking the button opens a `<Dialog>` whose `<DialogContent className="max-w-3xl">` renders the existing `<StatementUpload ... />` component with the same props it already receives today.
- Remove `<StatementUpload>` from inside the Expenses tab body (it currently sits at the top of `TabsContent value="expenses"`, ~line 687). All other expense table logic stays exactly where it is.

### 2. File input restriction

In `src/components/finance/StatementUpload.tsx`:
- The dropzone helper text and validation already mention PDF + Excel; tighten the file picker so it only accepts `.xlsx` and `.pdf` (drop `.xls`):
  - `<input ... accept=".xlsx,application/pdf" />`
  - Update `addFiles()` validation regex to accept only `.pdf` and `.xlsx`.
  - Update the `isExcelFile()` check / dropzone copy to say "PDF & XLSX".

### 3. Tab consolidation

Replace the long flat `TabsList` with a slim 4-tab layout:

| Tab value          | Label                   | Renders                                                                 |
|--------------------|-------------------------|-------------------------------------------------------------------------|
| `overview`         | Overview & P&L          | `PLSummaryTab` then `RevenueTab` stacked                                |
| `settlements`      | Settlements             | `SettlementsTab`                                                        |
| `invoicing`        | Invoicing & Factoring   | `InvoicingTab` then `FactoringTab` stacked                              |
| `payroll`          | Payroll & Commissions   | `PayrollTab` (commissions stay deferred per request — see notes)        |

Remaining current tabs (`profitability`, `expenses`, `commissions`, `settings`) are not part of the requested 4 buckets. To avoid losing functionality without explicit guidance, I will move them into a small secondary chip row below the main tabs labeled "More", or — simpler — keep their content rendered conditionally via the same tab switch but hidden from `TabsList`. **Recommendation:** keep only the 4 requested tabs visible; the Expenses table, Profitability, Commissions, and Settings panels remain in the file but are not rendered. We can resurface them in a follow-up once you tell me where to slot them.

`defaultValue` becomes `"overview"`. Update the `?tab=` query-param sync logic to map old values (`pl`, `revenue` → `overview`; `factoring` → `invoicing`; `commissions` → `payroll`).

### 4. Spacing & animation per tab

Wrap each `TabsContent` body in:
```tsx
<div className="space-y-6 animate-in fade-in-50">
  ...tab content...
</div>
```
Drop the existing `mt-6` on `TabsContent` (the wrapper handles spacing).

### 5. Dynamic "Load ID" terminology

Add a small helper at the top of each affected tab:
```tsx
const { isIndependent } = useOrganizationMode();
const loadIdLabel = isIndependent ? 'Load ID' : 'Landstar Load ID';
```

Apply it in:
- `src/components/finance/RevenueTab.tsx` — the `<TableHead>Load ID</TableHead>` becomes `<TableHead>{loadIdLabel}</TableHead>`. Cell content (`load.landstar_load_id || '-'`) is unchanged.
- `src/components/finance/LoadProfitabilityTab.tsx` — wherever the load identifier column header is rendered, swap to `{loadIdLabel}`. The data fallback (`load.landstar_load_id || origin→destination`) is unchanged.

No styles, sorting, filtering, or row rendering inside these tables changes.

### Files touched

- `src/pages/Finance.tsx` — header, modal, tab consolidation, wrapper divs, query-param mapping.
- `src/components/finance/StatementUpload.tsx` — accept attribute + validation tightened to `.xlsx`/`.pdf`.
- `src/components/finance/RevenueTab.tsx` — dynamic load-ID header only.
- `src/components/finance/LoadProfitabilityTab.tsx` — dynamic load-ID header only.

### Open question

The 4 requested tab buckets don't include **Expenses**, **Profitability**, **Commissions**, or **Settings**. Want me to:

- (a) Hide them entirely (simplest, matches the brief literally), or
- (b) Add a secondary "More" tab/menu that exposes Expenses, Profitability, Commissions, and Settings so nothing is lost?

I'll default to **(b)** unless you say otherwise — it preserves functionality without re-cluttering the main tab strip.
