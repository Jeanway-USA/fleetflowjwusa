## Goal

Add a compliance-tracked In-Bond / international shipment workflow (Landstar Rule 480): flag the load, capture the CF 7512 number, warn the driver, and auto-bill the Rule 480 fee as a Company accessorial.

## What gets built

### 1. Database migration

**`fleet_loads` — new columns**
- `is_in_bond boolean NOT NULL DEFAULT false`
- `cf_7512_number text` — Customs Form 7512 number; only required when `is_in_bond = true`

**Validation trigger `enforce_in_bond_requires_cf7512`** (BEFORE INSERT/UPDATE on `fleet_loads`): raises a `42501` error if `is_in_bond = true` and `cf_7512_number` is null/blank. Server-side guard so the CF number is genuinely mandatory.

**Driver guardrail update** (`enforce_driver_fleet_loads_column_restrictions`): block drivers from flipping `is_in_bond` or editing `cf_7512_number`.

**Accessorial catalog seed**: add `'In-Bond Fee (Rule 480)'` with `default_is_driver_pay = false, sort_order = 170` for every existing org and inside `create_onboarding_org`.

**Org-level fee setting**: add a single `company_settings` row per existing org with `setting_key = 'in_bond_fee'`, `setting_value = '100'` (default $100, editable in Settings).

### 2. Settings UI

In **Settings → Company → Detention/Over-Dim section**, append a small "In-Bond (Rule 480)" card with one editable currency input — the default fee that gets auto-added when a load is flagged In-Bond. Saves via `company_settings` upsert.

### 3. Load edit dialog (`src/pages/FleetLoads.tsx`)

In the existing "Revenue" tab next to the Power Only checkbox (or grouped above the Dimensions section on Details — placed on Details for visibility):

- **Checkbox** "In-Bond / International Shipment (Rule 480)" → toggles `formData.is_in_bond`.
- When checked, an inline required text input appears for **CF 7512 Number** with `maxLength=64` and zod-validated on submit (`z.string().trim().min(1).max(64)`).
- Submit blocks with a toast if In-Bond is checked but CF 7512 is empty.
- On save flow (same pattern as the existing Over-Dimension auto-accessorial):
  - Strip any prior auto In-Bond rows (matched by `accessorial_type = 'In-Bond Fee (Rule 480)'` AND `notes` starts with `Auto:`).
  - If `is_in_bond = true`, append one new auto row:
    - `accessorial_type = 'In-Bond Fee (Rule 480)'`
    - `amount = <in_bond_fee from company_settings>` (default 100)
    - `percentage = 100`, `is_driver_pay = false`
    - `notes = "Auto: Rule 480 fee · CF 7512 #{number}"`

### 4. Driver dashboard warning

**`src/components/driver/ActiveLoadCard.tsx`** — extend `Load` interface with `is_in_bond` and `cf_7512_number`. When `load.is_in_bond` is true, render a prominent destructive-styled banner at the top of the card (above the colored status bar):

```
🚨 IN-BOND SHIPMENT — DO NOT BREAK SEAL
CF 7512: <number>
```

Use existing destructive design tokens (`bg-destructive/15 text-destructive border-destructive/40`) for the banner; keep it semantic, not hardcoded colors.

Also surface a small "IN-BOND" badge on the FleetLoads list row for dispatchers, next to the status pill.

### 5. Load list query

Extend the `select(...)` calls (FleetLoads, Driver Dashboard active-load fetch) so the new columns flow through.

## Files

- `supabase/migrations/<ts>_in_bond_rule_480.sql` — columns, validation trigger, driver guardrail update, accessorial seed, `create_onboarding_org` update, `in_bond_fee` settings seed
- `src/pages/FleetLoads.tsx` — checkbox + CF 7512 input, zod validation, auto-accessorial sync, list badge
- `src/components/driver/ActiveLoadCard.tsx` — In-Bond banner + interface fields
- `src/components/settings/InBondFeeCard.tsx` (new) — fee config card
- `src/components/settings/CompanyTab.tsx` — mount the new card
- `src/integrations/supabase/types.ts` — regenerates after migration

## Out of scope (flag for follow-up)

- Customs broker contact storage / document upload (PARS/PAPS labels, manifest PDF).
- Border-crossing GPS milestones / customs clearance status tracking.
- Variable In-Bond fees per lane or per customer — single org-wide flat fee for v1.
