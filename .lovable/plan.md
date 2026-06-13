## Goal

Capture freight dimensions (Height, Width, Length) on each load. Compare against legal limits (13'6" H, 8'6" W, 70' L). Apply the corresponding Landstar Rule 670 Table A cents-per-mile surcharge to the load's mileage and auto-post the result as a **Company** accessorial (not driver pay).

## What gets built

### 1. Database migration

**`fleet_loads` — add dimension columns**
- `height_inches integer` — load height in inches
- `width_inches integer` — load width in inches
- `length_inches integer` — load length in inches
- `is_over_dimension boolean` (generated/derived in code, not stored — computed from the three above)

**Driver column guardrail (`enforce_driver_fleet_loads_column_restrictions`)** — block drivers from changing dimension fields.

**New table `over_dimension_rules` (per-org, editable Rule 670 Table A)**
- `id`, `org_id`, `dimension` (`'height' | 'width' | 'length'`), `min_inches int`, `max_inches int NULL` (NULL = unlimited), `cents_per_mile numeric`, `sort_order int`, `created_at`, `updated_at`
- UNIQUE(`org_id`, `dimension`, `min_inches`)
- Standard RLS: same-org SELECT, admin-only write. GRANT to authenticated + service_role. `set_over_dimension_rules_org_id` BEFORE INSERT trigger. `update_updated_at_column` trigger.
- Seed defaults for every existing org and inside `create_onboarding_org`:

  | Dimension | Range (over legal limit)         | CPM   |
  |-----------|----------------------------------|-------|
  | Height    | 13'7"–14'0" (163–168 in)         | $0.10 |
  | Height    | 14'1"–14'6" (169–174 in)         | $0.20 |
  | Height    | 14'7"–15'0" (175–180 in)         | $0.40 |
  | Height    | > 15'0" (181+ in)                | $0.75 |
  | Width     | 8'7"–10'0" (103–120 in)          | $0.10 |
  | Width     | 10'1"–12'0" (121–144 in)         | $0.20 |
  | Width     | 12'1"–14'0" (145–168 in)         | $0.40 |
  | Width     | > 14'0" (169+ in)                | $0.75 |
  | Length    | 70'1"–85'0" (841–1020 in)        | $0.10 |
  | Length    | 85'1"–95'0" (1021–1140 in)       | $0.20 |
  | Length    | 95'1"–105'0" (1141–1260 in)      | $0.40 |
  | Length    | > 105'0" (1261+ in)              | $0.75 |

  *(Defaults are seeded so the user can edit them later in Settings; the legal limits 13'6"/8'6"/70' are hard-coded constants — anything below the first band's `min_inches` is "legal" and produces zero surcharge.)*

### 2. Calculation utility — `src/utils/overDimension.ts`

```text
calcOverDimensionCharge({ height_in, width_in, length_in, miles, rules }) → {
  height_cpm, width_cpm, length_cpm,        // matched CPMs
  total_cpm,                                 // sum
  charge_amount,                             // total_cpm * miles
  breakdown: [{ dimension, value_in, cpm, miles, subtotal }]
}
```
- Resolves miles from `actual_miles ?? booked_miles ?? 0`.
- Returns `charge_amount = 0` and an empty breakdown when no dimension exceeds its legal limit.
- Unit-tested in `src/utils/overDimension.test.ts` (legal load → $0, 14' tall × 500 mi → $50, multi-dimension oversize, missing miles → $0).

### 3. FleetLoads UI

**Load edit dialog — new "Dimensions" section on the Details tab** (above Empty Miles):
- Three inputs accepting feet + inches (e.g. `13 ft`, `6 in`) that store as total inches. Component: `<FeetInchesInput />` (new, `src/components/shared/FeetInchesInput.tsx`).
- Inline badge: **"Legal"** (green) or **"Over-Dimension — +$X.XX/mi"** (warning) with a tooltip listing matched bands per dimension.

**Load save flow (`createMutation` and `updateMutation`)**:
- After the load is saved, run `calcOverDimensionCharge`. If `charge_amount > 0`:
  - Remove any existing auto-generated Rule 670 accessorial rows for this load (matched by `accessorial_type = 'Over-Dimension (Rule 670)'` and `notes LIKE 'Auto-generated …'`).
  - Insert one new `load_accessorials` row:
    - `accessorial_type = 'Over-Dimension (Rule 670)'`
    - `amount = charge_amount`, `percentage = 100`
    - `is_driver_pay = false` (Company)
    - `notes = "Auto: H {h}\" → $X/mi, W {w}\" → $X/mi, L {l}\" → $X/mi × {miles} mi"`
- If `charge_amount === 0`, remove any prior auto rows for this load (dimensions were brought back into spec).
- Manually edited Over-Dimension rows are preserved by matching the `notes LIKE 'Auto:%'` filter.

### 4. Accessorial catalog

In the same migration, seed `'Over-Dimension (Rule 670)'` with `default_is_driver_pay = false, sort_order = 160` for every existing org and inside `create_onboarding_org` so the type also shows up in the manual accessorial dropdown.

### 5. Settings UI

New `OverDimensionRulesCard` mounted in **Settings → Company** (under DetentionRulesCard).
- Table of all `over_dimension_rules` for the org, grouped by dimension.
- Edit CPM and inch ranges inline; Save persists.
- Read-only legal-limit note: "Legal: 13'6" H × 8'6" W × 70' L".

## Files

- `supabase/migrations/<ts>_over_dimension_rule_670.sql` — columns, table, RLS, GRANTs, triggers, seed, `create_onboarding_org` update, guardrail update, accessorial-type seed
- `src/utils/overDimension.ts` (new) + `src/utils/overDimension.test.ts` (new)
- `src/components/shared/FeetInchesInput.tsx` (new)
- `src/components/settings/OverDimensionRulesCard.tsx` (new)
- `src/components/settings/CompanyTab.tsx` — mount the new card
- `src/pages/FleetLoads.tsx` — dimensions section, save-time auto-accessorial sync
- `src/integrations/supabase/types.ts` — regenerates after migration

## Out of scope (flag for follow-up)

- Per-mile billing for **deadhead/empty** miles (Rule 670 sometimes excludes empties; current pass uses loaded miles only via `actual_miles ?? booked_miles`).
- Permits/escort fees — those are separate Landstar tariffs and remain a manual accessorial.
- Tier-gating the Settings card behind subscription tier — left open as-is.
