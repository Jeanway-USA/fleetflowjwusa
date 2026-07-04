## Goal
Replace the globally hardcoded Florida SUTA/state-tax settings with a per-state table, driven by each driver's tax state.

## 1. Database

**New table `state_tax_configurations`** (org-scoped so each tenant can tune their own rates):
- `state_code` (text, 2-char)
- `suta_rate` (numeric)
- `suta_wage_base` (numeric)
- `has_state_income_tax` (boolean)
- `sit_rate` (numeric, flat-rate fallback for states with SIT — used by the engine only when `has_state_income_tax = true`; advanced bracket support is out of scope)
- `org_id`, standard timestamps, unique `(org_id, state_code)`
- GRANTs + RLS: owner/payroll_admin manage; authenticated in same org can read
- Seed on first read per org: FL (0.027 / $7,000 / false) and TX (0.00 / $9,000 / false). All 50 states inserted with 0.00 defaults so the settings table renders a full list; owners edit as needed.

**`drivers` table**:
- Add `tax_state` (text, 2-char, nullable). Backfill nothing — nulls fall back to the org's default (see engine below).

**`payroll_settings`**:
- Add `default_tax_state` (text, default `'FL'`) so orgs with drivers missing a `tax_state` still get a deterministic answer.
- Leave the existing `suta_rate` / `suta_wage_base` columns in place for now but stop reading them in the engine (documented as deprecated in the migration comment; removed in a future cleanup).

## 2. Backend engine (`src/lib/w2-payroll.ts` + `supabase/functions/run-w2-payroll`)

- Extend `PayrollSettings` input with a resolved `stateConfig: { state_code, suta_rate, suta_wage_base, has_state_income_tax, sit_rate }`.
- SUTA calc uses `stateConfig.suta_rate` / `stateConfig.suta_wage_base` instead of `settings.suta_*`.
- Add `stateIncomeTax` to the breakdown: `has_state_income_tax ? gross * sit_rate : 0`. Add matching column `state_income_tax` to `driver_payroll` and include it in the employee total / net pay.
- Edge function resolution order per driver:
  1. `drivers.tax_state`
  2. `payroll_settings.default_tax_state`
  3. `'FL'`
  Then load the matching row from `state_tax_configurations` for the org (auto-seed the full 50-state set on first hit).
- Return `state_code` and `state_income_tax` in each result so the UI can show them.

## 3. UI

**Settings → Payroll (`PayrollTaxesCard`)**:
- Keep FICA / pay-frequency sections.
- Remove the "Florida Reemployment Tax (SUTA)" section.
- Add a `default_tax_state` selector.
- Add a new **State Tax Configurations** table below with rows for every state:
  - Columns: State, SUTA Rate, SUTA Wage Base, Has State Income Tax (switch), SIT Rate (disabled unless the switch is on).
  - Inline edit + single "Save state changes" button (bulk upsert).
  - "Reset to statutory defaults" per row (FL/TX seeded values, others 0).

**Driver form (`DriverDetailSheet` / driver create):**
- Add a "Tax State" select (US states) alongside existing driver fields.

**`RunW2PayrollDialog` + `W2PayrollHistoryCard`:**
- Show a per-driver `Tax State` badge in the preview and history rows.
- Add `State Income Tax` line to the tax preview when > 0.

## 4. Out of scope
- Multi-state per driver / reciprocity.
- Bracketed state income tax (only flat `sit_rate`).
- Year-end multi-state W-2 form generation.

## Technical details
- Migration order: create `state_tax_configurations` (+ GRANTs + RLS + policies + updated_at trigger), add `drivers.tax_state`, add `payroll_settings.default_tax_state`, add `driver_payroll.state_income_tax` numeric default 0.
- Seed function `public.seed_state_tax_configurations(_org_id uuid)` invoked from the edge function and from `PayrollTaxesCard` on first load if the table is empty for the org.
- Regenerate `src/integrations/supabase/types.ts` after migration approval.
- Keep `w2-payroll.ts` the single source of truth; edge function mirrors it exactly.
