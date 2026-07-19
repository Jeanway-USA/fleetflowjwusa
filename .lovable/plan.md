## Landstar-aware expanded view for Agency Loads

The agency_loads schema (verified) has no fields for linehaul, fuel surcharge, tarp fee, BCO split %, exception status, or Pay2Day. This work needs a small migration, form additions, and a rewritten expanded row.

### 1. Migration — new columns on `public.agency_loads`

- `gross_linehaul numeric` — the portion of revenue the split applies to.
- `fuel_surcharge numeric` — passed through at 100%.
- `tarp_fee numeric` — passed through at 100%.
- `bco_split_pct numeric default 72` — allowed range 65–75 (soft-checked in the form).
- `exception_status text default 'normal'` — enum-like: `normal | disrupted | pending_update`.
- `pay2day boolean default false`.

All nullable/defaulted so existing rows keep working. No RLS changes (existing 3 policies already cover new columns).

### 2. Edit dialog (`src/pages/AgencyLoads.tsx`)

Add a "Landstar / Revenue" section to the existing form with:

- Number inputs: Gross Linehaul, Fuel Surcharge, Tarp Fee.
- BCO Split % input (default 72, min 65, max 75, step 0.5).
- Select: Exception Status (Normal / Disrupted / Pending Update).
- Checkbox: Pay2Day fast settlement.

Leaves `broker_rate` / `carrier_rate` / `margin` alone — they stay as the brokerage view; the new fields cover the BCO Landstar view side-by-side.

### 3. Expanded row (`renderExpanded`) — full rewrite

Two side-by-side sections in a `grid grid-cols-1 md:grid-cols-2 gap-4`, with a clean card feel using existing semantic tokens (`bg-muted/30`, `border-border/60`, `text-muted-foreground` labels).

**A. Revenue Segregation** (non-overlapping fields, each on its own row inside the card):

```text
Gross Linehaul       $ X,XXX.XX
Fuel Surcharge       $   XXX.XX
Accessorials (Tarp)  $   XXX.XX
──────────────────────────────
Total Load Revenue   $ X,XXX.XX   (sum, read-only)
```

**B. BCO Pay Calculation** (Landstar split logic, math shown inline):

```text
Linehaul split (72% of Gross Linehaul)     $ X,XXX.XX
+ Fuel Surcharge (100% pass-through)       $   XXX.XX
+ Tarp Fee (100% pass-through)             $   XXX.XX
──────────────────────────────
BCO Payout                                  $ X,XXX.XX
```

The percentage only multiplies `gross_linehaul`; fuel and tarp are added at 100%. A small caption under the block spells this out: "Split applies to linehaul only. Fuel and accessorials pay through at 100%. Deductions are handled at the truck-gross level and are not shown here."

Below both cards, a **status strip**:

- `Exception:` pill using `StatusBadge`-style tokens: green for Normal, amber for Pending Update, red for Disrupted.
- `Pay2Day:` badge — filled accent pill when enabled ("Pay2Day Fast Settlement"), muted outline pill when disabled ("Standard Settlement").

Pickup/Delivery datetimes, reference, and notes remain at the bottom of the expanded panel (unchanged).

### 4. Explicit exclusion

No deductions field or column anywhere in the expanded view, form, or calculation, per your constraint.

### Files touched

- New migration file under `supabase/migrations/` adding the six columns with defaults.
- `src/pages/AgencyLoads.tsx` — form additions, `renderExpanded` rewrite, and a small helper for the BCO payout formula.

### Out of scope

- No changes to the desktop columns, mobile card summary, `DataTable`, Fleet Loads, or settlements.
- No automation of `margin` from the new fields (kept independent for the brokerage view).
