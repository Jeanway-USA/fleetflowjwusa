## Goal

Make W-2 withholding accurate and automatic using official IRS Publication 15-T percentage-method tables, back both settlements and in-house payroll with one shared tax engine and one YTD source, and consolidate Finance/Payroll/Tax Hub into a single, cleaner Finance section.

## 1. Tax tables and configuration (per tax year, admin-editable)

New table `tax_year_configs` (org-scoped, one row per tax year):
- Federal: Pub 15-T percentage-method brackets for each filing status, both the standard and the "Step 2 checkbox" (multiple jobs) table sets, standard deduction amounts, dependent credit amounts.
- FICA: Social Security rate 6.2% + wage base, Medicare 1.45%, additional Medicare 0.9% + threshold, employer-side mirrors.
- FUTA rate/wage base.
- Effective/locked flags so a closed year's numbers can never shift retroactively.

Seed 2026 federal values. State rules stay in the existing `state_tax_configurations` table, extended with a `tax_year` column so state rates version the same way.

An admin editor lives under Finance → Payroll & Taxes → Settings, with a "duplicate last year" action for rolling forward.

## 2. Shared calculation engine

Rewrite `src/utils/payCalculations.ts`'s W-2 section into a dedicated module `src/lib/payroll/`:
- `taxEngine.ts` — pure functions implementing Pub 15-T Worksheet 1: annualize wages by pay frequency, apply W-4 Step 2/3/4 adjustments, look up the bracket, de-annualize, add extra withholding; FICA with wage-base and YTD caps; state income tax; employer SS/Medicare/FUTA/SUTA.
- `profiles.ts` — one resolver that assembles an employee tax profile (employment class, filing status, dependents, extra withholding, work/residence state, exemptions) from `driver_w4_info` + `driver_state_tax_info` + `drivers`, with an employee-agnostic shape so non-driver staff plug in later with no engine change.
- `ytd.ts` — a single YTD source that unions `driver_payroll` and `driver_settlements` for the tax year, so wage-base caps and stubs never disagree.
- Unit tests against published IRS worksheet examples for each filing status, plus wage-base crossover and additional-Medicare cases.

The engine returns a full, auditable breakdown: gross, each tax line with the rate and table row used, other deductions, net.

## 3. Auto withholding at generation time

- W-2 pay runs (In-House Payroll) call the engine and persist every line into `tax_withholding_ledger` — currently only federal is stored there, so state income tax and the employer-side amounts get their own columns instead of being dropped. The active-batch totals then read straight from stored rows (today the state column is hardcoded to 0).
- Settlement generation: contractors and lease drivers are unchanged, no withholding. If a W-2 driver is included, the settlement pulls the same engine result and stores the total in `tax_withholding` plus a per-line JSON snapshot, so the list view and detail sheet always agree.
- Every calculation stores an immutable snapshot: tax year, config version, profile values, and each rate applied.
- Manual overrides are allowed only for owner/payroll_admin, require a reason, and write an `audit_logs` row recording the computed value vs the override.

## 4. Statements and stubs

- Settlement detail, printable statement, and the W-2 pay stub all render one shared `Gross → Taxes (itemized) → Other deductions → Net` block driven by the stored snapshot.
- Pay stubs remain downloadable by the employee from the driver dashboard, now showing period and YTD columns for every tax line.

## 5. Employer liability reporting

Inside Payroll & Taxes:
- Employer tax summary by quarter: 941 lines (federal income tax withheld, SS wages/tax, Medicare wages/tax, additional Medicare), plus FUTA and per-state SUTA/SIT deposits.
- Existing federal and state filing registries move here unchanged.

## 6. Finance consolidation

One sidebar item, "Finance", with four tabs:
1. **Overview** — P&L summary, KPIs.
2. **Revenue & Loads** — revenue, load profitability, invoicing, factoring, commissions (secondary items become sub-sections, not top-level tabs).
3. **Settlements & Pay Runs** — driver settlements plus the in-house payroll batch, split by contractor vs W-2.
4. **Payroll & Taxes** — employee tax profiles, YTD, employer liabilities, filing registries, and everything currently in Tax Hub (W-2/1099 prep, multi-state overview).

`/admin/tax-hub` and `/finance/inhouse-payroll` redirect into the matching Finance tab so existing links keep working. Rarely used controls (tax table editor, compensation settings, safety-bonus settings, reconciliation tools) move behind a "Settings" panel within their tab. Dark theme and existing component language are unchanged.

## Technical notes

- Migrations: `tax_year_configs` (+ GRANTs and org-scoped RLS), `tax_year` on `state_tax_configurations`, extra withholding columns on `tax_withholding_ledger`, and a JSON calculation snapshot column on `driver_payroll` and `driver_settlements`.
- `generate_driver_settlements` gains a W-2 branch that fills `tax_withholding`; the generated `net_pay` column already subtracts it.
- Non-driver employees: the profile resolver and engine key off a generic `payee` shape, so a future `employees` table needs only a new resolver — no engine, ledger, or reporting changes. No employee UI in this pass.
- Sequencing: tax tables and engine + tests first, then persistence and generation, then statements/reporting, then the navigation consolidation last so the refactor lands on stable logic.
