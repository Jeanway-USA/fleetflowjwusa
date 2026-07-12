## Goal

Split the single "Filing Registry" table into two clean sections — **Federal** and **State** — and place each on its natural tab in the Tax Hub. State filings are also organized per state (grouped/collapsible), and pulled from the org's active state list rather than hardcoded to TX + FL.

## Current state

- `TaxFilingRegistryTab.tsx` renders one flat table that mixes federal (941, 940, W-2/1099), Texas TWC (C-3), and Florida DOR (RT-6) filings.
- The Tax Hub Federal tab embeds this full mixed registry, so state deadlines clutter the federal view. The Multi-State tab has no filings surface at all.

## Changes

### 1. Split the registry into Federal-only and State-only components (`src/components/finance/inhouse-payroll/`)

- **Rename/refactor** `TaxFilingRegistryTab.tsx` into two focused components that share the same completion/void/exempt data model (`tax_filing_completions`) and `MarkFiledDialog` / `VoidExemptDialog`:
  - `FederalFilingRegistry.tsx` — Form 941 (4 quarters), Form 940 (annual FUTA), W-2 / 1099-NEC (annual). Header: "Federal Filings — IRS / SSA".
  - `StateFilingRegistry.tsx` — SUTA + (where applicable) state income-tax filings, grouped per state with a collapsible per-state section showing that state's deadlines.
- Extract a shared helper file `filing-registry-shared.ts` containing:
  - `Deadline` type
  - `keyFor(deadline)` (unchanged, so existing `tax_filing_completions.form_key` values keep working)
  - Federal deadline builder
  - State deadline builder that takes a list of active state codes and returns per-state deadlines
- Delete the old `TaxFilingRegistryTab.tsx` after both consumers migrate.

### 2. Data-driven state list

- `StateFilingRegistry` reads active states from `state_tax_configurations` (already loaded for the Multi-State tab) plus any state present in `drivers.tax_state`, so registry rows match the states actually shown on the Multi-State tab.
- Build a static per-state form map for the states we can reliably support today. Ship with:
  - **TX** — Form C-3 (SUI), quarterly.
  - **FL** — Form RT-6 (reemployment tax), quarterly.
  - **Generic fallback** for any other active state: two placeholder rows per year — "SUTA Return (Qn)" quarterly and, only if the state has `has_state_income_tax = true`, "State Withholding (Qn)". Jurisdiction shows the state code. This keeps the registry accurate-enough-not-to-mislead while we build state-specific form metadata later; a small banner on the section notes "Generic deadlines shown — verify form names with each state agency."
- Each state block is collapsible, defaulting to expanded when it contains any Overdue or Due-in-≤30-days row; collapsed otherwise. A summary chip on the trigger shows counts (e.g. "TX · 4 due · 0 overdue").

### 3. Update Tax Hub tabs (`src/pages/admin/TaxHub.tsx`)

- **Federal tab**: replace `<TaxFilingRegistryTab />` with `<FederalFilingRegistry />` and update the card description to "Federal payroll deadlines. Marking a form filed here locks the row for audit."
- **Multi-State tab**: below the existing Multi-State Overview table, add a new card `State Filing Deadlines` containing `<StateFilingRegistry />`.

### 4. Nothing else moves

- `tax_filing_completions` table, its RLS, `MarkFiledDialog`, and `VoidExemptDialog` stay as-is — only presentation changes.
- No schema changes. No changes to the Finance page (Tax Hub already owns the registry).

## Out of scope
- Adding full state-specific form catalogs beyond TX and FL. Generic quarterly placeholders + a "verify with agency" banner cover other states without pretending they are legally exact form names.
- Alerts / notifications for upcoming deadlines.
