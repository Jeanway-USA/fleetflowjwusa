## Goal
Surface each active driver's HOS snapshot on the dispatcher's Driver Status grid with a traffic-light badge and stale-data warning.

## Scope
Single component: `src/components/dispatcher/DriverStatusGrid.tsx`. This is the dispatcher-facing list on `DispatcherDashboard`. No changes to the main `/drivers` page (its DriverDetailSheet already shows the driver's record).

## Changes — `src/components/dispatcher/DriverStatusGrid.tsx`

### 1. Query
Extend the `Driver` interface and the `.select(...)` to include `remaining_drive_hours, hos_last_updated`. (Both already exist on `drivers` from the prior migration.)

### 2. New helper — `getHosState(hours, updatedAt)`
Returns `{ tone, label, isStale, relative }`:
- If `updatedAt` is null → `{ tone: 'muted', label: 'No HOS', isStale: false, relative: null }`.
- Compute `ageMs = Date.now() - new Date(updatedAt).getTime()`.
- `isStale = ageMs > 14 * 3600 * 1000`.
- If stale → `tone: 'muted'` (gray badge) regardless of hour value.
- Else map hours → tone:
  - `hours <= 2` → `red`
  - `hours <= 6` → `yellow`
  - `hours >= 7` → `green`
  - `hours == null` and not stale → `muted` with label `No HOS`
- `relative`: use `formatDistanceToNow(new Date(updatedAt), { addSuffix: true })` from `date-fns` → "Updated 2h ago" style. Prefix with "Updated ".

### 3. UI in each driver card
Insert a new row under the Available/On Load badge row (and above the expiring-credentials warning):

```
<HOS badge>   Updated 2h ago
```

- Badge: pill with `Clock` icon (lucide), text `"{hours}h drive"` (e.g. `8.5h drive`). For stale → `Pending Reset` text. Color classes (semantic Tailwind tokens):
  - red:    `bg-destructive/10 text-destructive border-destructive/20`
  - yellow: `bg-warning/10 text-warning border-warning/20`
  - green:  `bg-success/10 text-success border-success/20`
  - muted:  `bg-muted text-muted-foreground border-border`
- When stale, wrap the badge in `<Tooltip>` (shadcn) → content: `Pending Reset — Verify with Driver`.
- Relative timestamp rendered as `<span className="text-[11px] text-muted-foreground">Updated 2h ago</span>` next to badge. Hidden when `updatedAt` is null.

### 4. Imports
Add `Clock` from lucide-react, `formatDistanceToNow` from `date-fns`, and `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` from `@/components/ui/tooltip`. Wrap the grid container (or each badge) in `TooltipProvider` once at the top of the rendered tree.

## Out of scope
- No DB changes.
- No edits to the main Drivers page or DriverDetailSheet.
- No realtime subscription — existing 2-minute staleTime on the query is sufficient; the relative timestamp will refresh on next render.
