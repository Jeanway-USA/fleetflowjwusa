
# Landstar LAND 100-A Rules — Tariff Alignment Plan

Goal: bring the existing Detention, Over-Dimension, and In-Bond features into exact compliance with the LAND 100-A tariff (effective March 15, 2020), then expand the accessorial catalog with the other monetized rules in the document. Everything stays editable per org (carriers can override) — the tariff values are seeds, not hard-coded constants.

---

## Phase 1 — Correct what's already built (highest priority)

### A. Rule 500 — Detention With Power (replace existing seed table)

Current seed only has ~3 trailer types. Replace with the full Landstar Table (Rule 500 §3):

```text
Trailer Type                       Free Hrs   $/Hr    Max/24h
B Unit – Cargo Van                   2        65      450
C Unit – Cube Van                    2        65      450
D Unit – Straight Truck              2        65      450
Van                                  2        70      450
Temperature Control                  2        75      900   (+ layover, see below)
Flatbed/Step-Deck/Single Drop – Non-Stretch    2    80    500
Flatbed/Step-Deck/Single Drop – Stretch        2    90    550
Double Drop/RGN 5-Axle Non-Stretch    2      100      600
Double Drop/RGN 5-Axle Stretch        2      115      650
Double Drop/RGN 6-Axle Non-Stretch    2      100      700
Double Drop/RGN 6-Axle Stretch        2      115      750
7-Axle Non-Stretch                    2      125      800
7-Axle Stretch                        2      145      900
8-Axle Non-Stretch                    2      150     1000
8-Axle Stretch                        2      175     1100
9-Axle Non-Stretch                    3      175     1500
9-Axle Stretch                        3      205     1650
12/13-Axle Non-Stretch                3      200     2000
12/13-Axle Stretch                    3      240     2200
Over 13-Axle Non-Stretch              4      225     2250
Over 13-Axle Stretch                  4      275     2500
```

- Extend `detention_rules` with `max_charge_per_day` and `is_stretch` columns; seed all 21 rows per org.
- Detention dollar calc on Load save: `min(hours_over_free × hourly, max_per_24h × ceil(hours/24))`.
- Add the Rule 500 §7(a) meal-period rule: subtract up to 1h if `meal_break_minutes` is recorded on the arrival event.

### B. Rule 500 NOTE A — Temperature Control Layover

Separate accessorial type `Temp Control Layover (Rule 500-A)`:
- $75/hr, no free time, 12-hr cap per 24-hr day, only between 08:00–23:59.
- Triggered when load is `Temperature Controlled = true` AND delivery is held overnight/weekend/holiday through no fault of carrier (manual checkbox on load close).

### C. Rule 501 — Detention Without Power (Spotted Trailers)

New accessorial: `Spotted Trailer Detention (Rule 501)` — 24-hr free, $150 per 24-hr period or fraction.
- Add `is_spotted_trailer` boolean on `fleet_loads`.
- When true, the Rule 500 calc is bypassed in favor of Rule 501.

### D. Rule 670 — Over-Dimension (replace seed bands with exact Table A)

Replace `over_dimension_rules` seed with the official Table A bands, including the **minimum-charge floor** that the current code ignores:

```text
WIDTH       cpm   min$         HEIGHT      cpm   min$         LENGTH       cpm   min$
8'6"–9'      40   175          13'6"–14'    75   250          70'–80'       30   175
9'–10'       45   200          14'–14'6"   100   300          80'–85'       50   200
10'–11'      50   225          14'6"–15'   150   400          85'–90'       70   225
11'–12'      65   250          15'–15'6"   200   600          90'–95'       90   250
12'–12'6"    80   275          15'6"–16'   300   800          95'–100'     110   300
12'6"–13'   110   300          16'–16'6"   400  1100         100'–105'     135   400
13'–13'6"   130   325          16'6"–17'   500  1500         105'–110'     170   400
13'6"–14'   155   375          17'–17'6"   600  2000         110'–115'     205   400
14'–14'6"   180   500          17'6"–18'   700  2500         115'–120'     230   500
14'6"–15'   210   600          18'+       1000  3500*        120'–130'    275   600
15'–15'6"   240   700                                        130'–140'    325   700
15'6"–16'   280   800                                        140'–150'    375   800
16'–16'6"   325   900                                        150'–160'    425   950
16'6"–17'   400  1100                                        160'–170'    575  1500
17'–17'6"   500  1300                                        170'–180'    750  2000
17'6"–18'   600  1500                                        180'–190'   1000  2500
18'+        800  2000*                                       190'+       1300  3000*
```
- Final charge per dimension = `max(min_charge, cpm × miles / 100)`.
- Implement NOTE A (width > 18' → +$2/ft), NOTE B (height > 18' → +$3/ft over and min +$1000/ft), NOTE C (length > 190' → +$3 per 10-ft increment, min +$500/10-ft).
- Rule 670 NOTE 1: when multiple oversize dimensions, charge only the **single highest** (current code sums them — fix).
- Add four sibling Rule 670 accessorials, each as a Company-side line, manual amount:
  - Pilot/Escort Vehicle (+ $75/night per-person per-diem field)
  - Flagman (+ per-diem)
  - Police Escort (pass-through cost + Rule 300 advancing fee)
  - Route Survey (pass-through)
  - Permit Charges (per-state, actual cost + Rule 300 advancing fee)

### E. Rule 480 — In-Bond enhancements

Existing $100 flat fee stays. Add to the In-Bond panel on the load:
- `TIR Carnet` checkbox → +$35 Company accessorial.
- `Doc Pickup From Broker` count field → $10 each, capped at $50.
- `Customs Random Unload/Reload Cost` currency field → pass-through.
- Enforce Rule 480 §3,4 in UI: when `is_in_bond = true`, hide stop-off, split-pickup, and reconsignment actions.

---

## Phase 2 — New accessorials (one migration, one Settings panel)

All seeded into `accessorial_types` with `default_is_driver_pay = false`, configurable in Settings → Company → Tariff Defaults:

| Rule | Accessorial | Default |
|------|-------------|---------|
| 482  | Deadhead Miles | 125¢/mi over 50-mi radius, min $175 |
| 483  | Short-Pay Processing Fee | $25 |
| 530  | Expedited / Premium Service | flag + negotiated $ field |
| 558  | Extra Driver / Team Service | negotiated $ field |
| 575  | Lineal-Foot Rule | recalculates billable weight (1 lb/lineal-ft) if linear feet > 20 |
| 577  | Carrier Loading / Unloading | $0.25/cwt, min $80 |
| 579  | Port / Pier Charge | $8.27/cwt, min $37, max $782 |
| 579  | Import/Export Doc Prep | $118/shipment |
| 712  | Pallet-Exchange (block) | UI-only refuse |
| 715  | Partial Prepaid/Collect (block) | UI-only refuse |
| 740  | Special Permits | actual cost + Rule 300 advancing |
| 750  | Weekend/Holiday Pickup-Delivery | $0.75/cwt, min $165/vehicle |
| 750  | Limited-Access Delivery | $100 std, $200 NYC, $250 + 8h det Trade Show |
| 750  | Unimproved Location | $125 |
| 820  | Reconsignment / Diversion | min $200 (location) or $15 (name-only) |
| 830  | Re-Delivery (within 8h) | $200/attempt |
| 848  | Declared-Value Surcharge | 6.51¢ per $100 declared, max $250k cap |
| 810  | Temperature Control (no agreed rate) | $0.25/loaded mile, min $150 |

Each row added to a new `tariff_default_rates` table keyed by `(org_id, accessorial_type)` so admins can override.

---

## Phase 3 — Bill-of-Lading & operational guards

- Rule 660 Order-Notify → block at load create.
- Rule 712 Pallet-Exchange → block.
- Rule 715 Partial Prepaid/Collect → enforce single Bill-To.
- Rule 780 Prohibited/Restricted Commodities → searchable list + warning on commodity entry.
- Rule 848 Declared-Value field on load (auto-adds surcharge).
- Rule 890 / 893 Hazmat & Liftgate placeholders (already in catalog — surface checkboxes on the load).

---

## Out of scope

- Mexico/Canada rate-side adjustments (Rule 180/190) and currency conversion.
- LTL classification (NMFC) and density rating.
- COD Rule 430 (we already block COD).
- Cargo-claim adjudication workflow (Rule 848 claim handling).

---

## Technical notes

- One migration per phase; Phase 1 alone is ~3 tables touched (`detention_rules`, `over_dimension_rules`, `fleet_loads`).
- Calculation utilities live in `src/utils/{detention,overDimension,tariff480,tariff750,…}.ts`, each unit-tested.
- All seeded values insertable via `ON CONFLICT DO NOTHING` so existing org overrides aren't clobbered.
- Settings UI: extend `CompanyTab.tsx` with a single collapsible "Landstar LAND 100-A Tariff" section grouping every card.

---

## Suggested order

1. Approve Phase 1 (correctness fixes for already-shipped features).
2. After Phase 1 lands, pick which Phase 2 accessorials to seed first — Rule 750 (weekend/limited-access), Rule 482 (deadhead), and Rule 848 (declared value) are usually the highest-revenue.
3. Phase 3 guards last.

Reply with "go" to start Phase 1, or tell me which rules to drop/add before I begin.
