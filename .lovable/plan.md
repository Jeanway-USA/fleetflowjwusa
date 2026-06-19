## Root cause

The base `Input` component (`src/components/ui/input.tsx`) ships with a **responsive** padding class: `pl-4 pr-4 ... sm:pl-3 sm:pr-3`. When callers wrap it with an absolutely-positioned icon and pass `className="pl-8"` (as `CurrencyInput` does) or `className="pr-8"` (as `PercentageInput` does), `twMerge` correctly replaces the base `pl-4` — **but it does NOT replace `sm:pl-3`** because `pl-8` is a different responsive scope. At the `sm:` breakpoint (≥640px, i.e. the desktop Edit Load dialog) the input falls back to `pl-3`, and the dollar/percent glyph overlaps the typed value. This is the clipping the user sees in the Revenue tab.

## Changes

### 1. `src/components/ui/input.tsx` — add first-class icon support

Extend the Input component (keep it a drop-in replacement; existing `<Input>` usages keep working unchanged):

- Add optional props `leftIcon?: React.ReactNode` and `rightIcon?: React.ReactNode`.
- When either is passed, render the input inside a `relative` wrapper, place the icon absolutely (`left-3` / `right-3`, vertically centered, `pointer-events-none`, `text-muted-foreground`), and apply the correct padding class to the `<input>`:
  - `leftIcon` → `pl-9 sm:pl-9` (overrides both base `pl-4` and `sm:pl-3`)
  - `rightIcon` → `pr-9 sm:pr-9`
- Forwarded `className` still merges last so callers can override.

This is the canonical fix Tasks 1 and 2 ask for.

### 2. `src/components/ui/numeric-input.tsx` — use the new pattern (and fix the bug today)

- `CurrencyInput`: replace `className={cn("pl-8", className)}` with `className={cn("pl-9 sm:pl-9", className)}` so the sm-breakpoint override stops winning. (Could be migrated to `<Input leftIcon={<DollarSign…/>} />` for consistency — will do that as part of the same edit.)
- `PercentageInput`: replace `className={cn("pr-8", className)}` with `className={cn("pr-9 sm:pr-9", className)}` (or migrate to `rightIcon`).

This alone fixes the Edit Load → Revenue tab clipping (Booked Linehaul, Fuel Surcharge, Lumper, Detention Pay, Advance Taken, custom-accessorial Amount, etc.), because every `$` field in `FleetLoads.tsx` is already routed through `CurrencyInput`.

### 3. Audit pass — raw inputs with absolute icons

Grep result already shows the search/date pickers using the `absolute left-…` / `absolute right-…` icon pattern with raw `<Input>`. For each, confirm the input has `pl-9`/`pr-9` (not just `pl-8` or `pl-10` paired with a different left offset), and bump to `pl-9 sm:pl-9` / `pr-9 sm:pr-9` where the icon is `left-3`/`right-3`. Files to spot-check:

- Global search bars: `src/pages/FleetLoads.tsx`, `src/pages/Trucks.tsx`, `src/pages/Drivers.tsx` (search filter row), `src/pages/CRM.tsx`, `src/pages/Finance.tsx`, `src/pages/IFTA.tsx`, `src/components/crm/BrokerDatabase.tsx`, `src/components/finance/driver-settlements/DriverSettlementsTab.tsx`, `src/components/dispatcher/ActiveLoadsBoard.tsx`, `src/components/maintenance/InventoryManagementTab.tsx`, `src/components/maintenance/ActiveWorkOrdersTab.tsx`, `src/components/superadmin/BillingPromotionsTab.tsx`.
- Date-picker-style inputs and any `$` inputs not using `CurrencyInput` (e.g. raw `<Input type="number">` with a `$` label) in `IndependentLoadBuilder.tsx`, `SmartLoadCreator.tsx`, `FactoringTab.tsx`.

Only edit files where the audit shows the current padding is insufficient or fights the `sm:` override.

## Out of scope

- No backend/schema/RLS changes.
- No visual redesign of the icons or input sizing — only padding tokens.
- No changes to layouts using icons that are decorative siblings (e.g. inside `CardHeader`, not overlapping any input), like the `DollarSign` at `FleetLoads.tsx:738`.

## Verification

- Open Fleet Loads → Edit a load → Revenue tab at desktop width; the `$` glyph no longer overlaps the numeric value in Booked Linehaul / Fuel Surcharge / Lumper / Detention / Advance / Accessorial Amount.
- Resize to mobile; same fields render with comfortable left padding.
- Spot-check one search bar and one date input from the audit list at both breakpoints.
