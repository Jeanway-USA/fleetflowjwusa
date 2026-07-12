
## Goal

Today's onboarding collects federal forms (W-4, I-9, W-9, IOO) but nothing about **where** the driver works and lives. The State Filing Registry relies on `drivers.tax_state`, which is currently unpopulated at signup. Add a dedicated **State Tax Withholding form** to onboarding that:

1. Captures work state (SUTA) + residence state (SIT).
2. Captures state W-4 withholding elections (generic — no per-state PDF templates needed, since the user said we build these forms ourselves).
3. Populates `drivers.tax_state` so the Filing Registry automatically shows only the states we actually owe.
4. Skips SIT fields when the residence state has no income tax (FL, TX, TN, NV, WA, SD, WY, AK, NH) — surfaces a friendly "No state income tax" note instead.
5. Generates a signed PDF stored alongside W-4/I-9 in `driver_signed_documents` (document_type = `state_tax`) and is reviewable in `SignedOnboardingDocuments`.

Applies to both W-2 employees (required) and 1099 contractors (residence state only, informational — many states require 1099 filings even without withholding).

## What gets built

### 1. Data layer (migration)
New table `public.driver_state_tax_info`:
- `driver_id` (PK, FK → drivers)
- `org_id`
- `work_state` (2-letter, required)
- `residence_state` (2-letter, required)
- `filing_status` (single/married/hoh/married_separate)
- `allowances` (int, generic — states vary)
- `additional_withholding` (numeric)
- `exempt` (bool, checkbox for states that allow it)
- `signed_at`, `signature_data`
- `created_at` / `updated_at`

GRANTs to `authenticated` + `service_role`, RLS: driver can insert/select own row; org admins (owner, safety, payroll_admin) can read within their org.

Security-definer RPC `upsert_driver_state_tax(_driver_id, _work_state, _residence_state, ...)` following the pattern of `upsert_driver_w4`. Inside the RPC, also `UPDATE drivers SET tax_state = _work_state WHERE id = _driver_id` so the Filing Registry lights up automatically.

### 2. New onboarding component
`src/components/onboarding/StateTaxForm.tsx` — self-contained form (like `W2Documents.tsx` conventions):
- Work state dropdown (all 50 + DC, using `src/lib/us-states.ts`).
- Residence state dropdown; if it matches work state, auto-mirror.
- Auto-hide SIT election fields when residence state is in the no-SIT list; show a green banner explaining no state withholding needed.
- Filing status radio, allowances, additional withholding, exempt checkbox.
- Signature pad + attestation checkbox.
- Exports `StateTaxFormState`, `EMPTY_STATE_TAX_FORM`, and a `validateStateTaxForm()` helper mirroring existing form patterns.

### 3. Onboarding page wiring
`src/pages/DriverOnboarding.tsx`:
- Add `stateTax` to `structuredFormsPresent` query (probe `driver_state_tax_info`).
- Extend `skipW2Structured` / `skip1099Structured` to include stateTax.
- In the W-2 branch: call `upsert_driver_state_tax` RPC; generate signed PDF via `generateFormPdf` with document_type `state_tax`; label "State Tax Withholding".
- 1099 branch: same, but only residence state + informational fields (skip filing status/allowances).
- Add `state_tax` to `DOCUMENT_LABELS` in `SignedOnboardingDocuments.tsx` → "State Tax Withholding".

### 4. Admin/UX polish
- `StateFilingRegistry.tsx` already reads distinct `drivers.tax_state` values — no change needed; states will start appearing as drivers complete onboarding.
- Add a small helper `src/lib/us-states.ts::NO_STATE_INCOME_TAX` (or extend existing file) to share the no-SIT list between the onboarding form and any future validation.

## Technical notes

- No new per-state PDF templates. The generated PDF uses the same generic `generateFormPdf` sections used by W-4/I-9 today, so it's uniform and printable.
- The RPC pattern keeps RLS clean — drivers can't set another driver's `tax_state`.
- `document_templates` is not touched — this is a system form, not a customizable template, matching the user's statement "it's not variable."
- Backfill is not needed: existing drivers already have `tax_state` set via Drivers page; new hires get it via this form.

## Out of scope

- Local (city/county) tax withholding.
- Per-state W-4 PDF facsimiles (e.g., NC-4, IL-W-4). Can be added later if legal review requires the actual state form.
- Reciprocity agreements between neighboring states (e.g., NJ/PA). Flagged for a follow-up.
