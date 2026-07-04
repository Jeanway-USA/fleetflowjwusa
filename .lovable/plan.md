# Backfill Real State Tax Rates into `state_tax_configurations`

Populate the seeder + existing org rows with accurate 2026 SUTA (new-employer) rates, wage bases, and state income tax flags/rates for all 50 states + DC, replacing the current 0.00 defaults.

## Data source strategy

Use published 2026 (or latest available 2025 carryover where 2026 not yet released) statutory values:
- **SUTA new-employer rate** and **taxable wage base** per state UI agency / APA payroll guides.
- **State Income Tax**: `has_state_income_tax` = true for states with any wage withholding; `sit_rate` = a reasonable flat effective rate for withholding estimation (flat-tax states use their statutory rate; graduated states use an approximate middle-bracket effective rate as a placeholder until bracketed SIT is implemented).

No-income-tax states (sit_rate = 0, has_state_income_tax = false):
AK, FL, NV, NH (wages), SD, TN, TX, WA, WY.

Flat-rate SIT states (use exact statutory rate):
AZ 2.5%, CO 4.40%, GA 5.39%, ID 5.695%, IL 4.95%, IN 3.00%, KY 4.0%, MI 4.25%, MS 4.7%, NC 4.25%, PA 3.07%, UT 4.55%.

Graduated SIT states (placeholder effective rate ~ mid bracket):
AL 4.0%, AR 3.9%, CA 6.0%, CT 5.0%, DE 5.2%, DC 6.5%, HI 7.0%, IA 3.8%, KS 5.25%, LA 3.0%, ME 6.75%, MD 4.75%, MA 5.0%, MN 6.8%, MO 4.7%, MT 5.0%, NE 5.2%, NJ 5.525%, NM 4.9%, NY 6.0%, ND 2.04%, OH 3.5%, OK 4.75%, OR 8.75%, RI 4.75%, SC 6.2%, VT 6.6%, VA 5.75%, WV 5.12%, WI 5.3%.

## Representative SUTA values (new-employer rate / wage base)

Examples (full list built into the migration):
- AL 2.7% / $8,000
- AK 1.0% / $49,700
- AZ 2.0% / $8,000
- CA 3.4% / $7,000
- CO 1.7% / $27,200
- FL 2.7% / $7,000
- GA 2.64% / $9,500
- IL 3.95% / $13,916
- MA 1.87% / $15,000
- MI 2.7% / $9,500
- NJ 2.8% / $43,300
- NY 4.025% / $12,800
- NC 1.0% / $32,600
- OH 2.7% / $9,000
- PA 3.822% / $10,000
- TX 2.7% / $9,000 (avg new employer)
- WA 90th-percentile / $72,800
- All 50 + DC included.

## Implementation

1. **New migration** `..._state_tax_rates_backfill.sql`:
   - Replace body of `public.seed_state_tax_configurations(_org_id UUID)` with a single `INSERT ... ON CONFLICT (org_id, state_code) DO UPDATE` containing the full 51-row VALUES list (state_code, suta_rate, suta_wage_base, has_state_income_tax, sit_rate).
   - `ON CONFLICT` updates only rows still at the default (`suta_rate = 0 AND sit_rate = 0 AND has_state_income_tax = false`) so admin-edited rows are preserved.
   - Immediately run one UPDATE against existing `state_tax_configurations` rows using the same VALUES list, again guarded by the "still default" predicate, so already-seeded orgs get the real numbers without wiping customizations.

2. **No UI/code changes** — `PayrollTaxesCard`, `run-w2-payroll`, and `w2-payroll.ts` already read from this table.

3. **Verification**: after migration, spot-check via `supabase--read_query` that FL/TX/CA/NY rows show the new rates for an existing org.

## Notes / caveats (surfaced in migration comment)

- New-employer SUTA rates are used because per-employer experience rates are private and vary yearly — admins can override in Settings → Payroll.
- Graduated-SIT `sit_rate` values are effective-rate placeholders; a future bracketed SIT engine can replace them without schema changes.
- Wage bases reflect the most recent published values (2025/2026); admins can adjust per state.
