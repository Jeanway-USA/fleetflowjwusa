## Goal
Capture an optional pickup/PU number on each fleet load and make it impossible to miss on the driver-facing UI.

## 1. Database
Add `pickup_number text` (nullable, no default) to `public.fleet_loads`. Existing RLS already covers all columns on this table.

## 2. Dispatcher load forms (`src/pages/FleetLoads.tsx`)
- Add a new `pickup_number` text input in the Create/Edit Load dialog, placed right next to the Origin / pickup details (same grid row, next to Pickup Date or under the Origin field).
- Wire it through the existing `formData` state and the insert/update mutation. Trim on submit; save `null` when blank so the driver UI's "hide when empty" rule works.
- Also surface `pickup_number` in the Smart Load Creator's parsed-PDF payload mapping (`shipper_facility`/`origin` block around line 941) so AI-extracted pickup numbers persist when present. No change required if the parser doesn't return one — just pass-through.

## 3. Driver-facing visibility
Render a high-contrast badge **only when `load.pickup_number` is truthy** in:
- `src/components/driver/ActiveLoadCard.tsx` — directly below the origin/shipper line (around line 266 / line 435 in the expanded details view).
- `src/components/driver/NextLoadPreview.tsx` — same placement under the origin.
- The Load Details view the driver opens (the expanded section inside `ActiveLoadCard` already covers this; no separate component to update).

Badge styling (tokenized, not hard-coded colors):
```tsx
<div className="inline-flex items-center gap-2 rounded-md border-2 border-warning bg-warning/15 px-3 py-1.5 text-warning-foreground font-bold tracking-wide shadow-sm">
  <Ticket className="h-4 w-4" />
  Pickup #: {load.pickup_number}
</div>
```
Uses the existing `warning` semantic tokens (already defined in `index.css` / Tailwind config) so it stays theme-consistent in light and dark mode while reading as a bright "stop and look" callout. If `warning` tokens aren't defined yet, fall back to `border-yellow-500 bg-yellow-100 dark:bg-yellow-500/20 text-yellow-900 dark:text-yellow-100` (still a one-line change).

When `pickup_number` is null/empty, the badge block is not rendered at all — no placeholder, no spacing reserved.

## 4. Types
`src/integrations/supabase/types.ts` is auto-regenerated after the migration runs, so the new column will be available without manual edits. Any cast-to-`any` on load objects (already common in this file) keeps the change minimal.

## Out of scope
- Agency loads / brokered loads table (`agency_loads`) — request was for "loads" the dispatcher creates for drivers.
- Public load tracker page — pickup numbers are operational and shouldn't be exposed to the broker's tracking link.
- No validation on format (carrier-specific; some are alphanumeric).
