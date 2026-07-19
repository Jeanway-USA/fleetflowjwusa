## Fleet Loads table styling refinement

Scope: visual polish on `DataTable` (static layout branch, used by Fleet Loads via `wrapCells`/`expandable`) and `StatusBadge`. No behavior or column changes.

Note on tokens: the project design system forbids hardcoded Tailwind color classes (`bg-gray-50`, `text-white`, etc.). I'll match the user's intent using semantic tokens that already exist (`border-border`, `bg-muted/30`, `text-muted-foreground`, plus `success`/`warning`/`primary`/`destructive` for badges). This keeps light/dark mode correct and stays consistent with the rest of FleetFlow.

### Changes in `src/components/shared/DataTable.tsx` (static-layout branch only)

1. Container: drop the heavy outer border ring — replace `rounded-lg border border-border overflow-auto` with `rounded-lg overflow-auto` on the static-layout code path so rows use only their horizontal dividers.
2. Header row: change `<tr>` from `border-b bg-muted/50` to `border-b border-border bg-transparent`. Update `<th>` classes to `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` for a muted, uppercase, semi-bold header.
3. Body rows: on each data `<tr>` replace `border-b transition-colors hover:bg-muted/50` with:
   - `border-b border-border/60` (subtle horizontal divider)
   - `even:bg-muted/30` (subtle zebra)
   - `hover:bg-muted/50 cursor-pointer transition-colors`
   - keep the existing `isSelected` (`bg-primary/5`) and `isExpanded` (`bg-muted/40`) overrides layered on top.
4. Expanded panel row: keep the accent background but align it to the new divider (`border-b border-border/60 bg-muted/20`).
5. Empty-state cell keeps current styling.

### Changes in `src/components/shared/StatusBadge.tsx`

Convert the outline badge into a soft "pill":
- Remove `variant="outline"` (drop the border).
- New base classes: `rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide`.
- Colour tokens per status type (soft bg + strong fg using existing semantic tokens):
  - success (delivered/paid/active/valid): `bg-success/15 text-success`
  - warning (in_transit/expiring_soon/out_of_service/inactive): `bg-warning/15 text-warning`
  - error (cancelled/expired/suspended/down): `bg-destructive/15 text-destructive`
  - info (booked/assigned/approved): `bg-primary/15 text-primary`
  - default (pending/unknown): `bg-muted text-muted-foreground`
- Keep `displayText` transform; drop `capitalize` since we uppercase.

Because `StatusBadge` is used site-wide, this pill treatment lands consistently everywhere status badges appear (Fleet Loads, Agency Loads, Drivers, etc.), which matches the "highly readable modern aesthetic" goal.

### Out of scope

- No changes to virtualized (non-wrap) `DataTable` path — Fleet Loads uses the static path via `wrapCells`.
- No column reordering, width tuning, or new data in the table.
- No changes to the expanded-row content layout inside `FleetLoads.tsx`.
