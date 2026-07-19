## Agency Loads mobile card — bring it in line with the request

The shared `DataTable` already handles horizontal scroll on tablet (`overflow-x-auto` + `min-w-[640px]`), hides the `<thead>` and swaps to a stacked card list below `md` (`md:hidden` / `hidden md:block`), and supports tap-to-expand. Those pieces are done and don't need editing.

What's actually off is Agency Loads' own `renderMobileCard` in `src/pages/AgencyLoads.tsx`: it uses a 2-column grid for From/To and buries the agency name as a muted subtitle. The request wants Load ID + Agency + Status prominent at the top, and Origin/Destination stacked vertically.

### Changes (single file: `src/pages/AgencyLoads.tsx`, mobile card only)

1. **Top row** — three-item header:
   - Left: `load_reference` (mono, semibold) with the short id fallback beneath it.
   - Middle (new position, elevated from subtitle): `broker_name` shown as the agency name in `text-sm font-medium`.
   - Right: `StatusBadge` + actions dropdown (unchanged).
   - Carrier moves down into a small "Carrier: …" line under the agency name so it's still visible but doesn't compete with it.

2. **Origin / Destination — stacked vertically** (replace the current 2-col grid):
   - `From` block: label + City, ST (medium weight) + ZIP muted.
   - Downward chevron/route separator.
   - `To` block: same shape.
   - Full width, no side-by-side.

3. **Footer row** (unchanged): margin $ · margin % · pickup date, separated by a thin `border-t border-border/60`.

4. **Tap-to-expand** — already works via the shared `DataTable`'s mobile branch (`canRowToggle` toggles `renderExpanded`). The expanded panel already shows rates, margin %, pickup/delivery datetimes, reference, and notes — no change needed. Only cosmetic: leave the chevron button in the header row so users know the card is expandable.

### Out of scope

- No changes to `DataTable`, Fleet Loads, or the desktop table.
- No schema or data changes.
- Semantic tokens stay in use per the project's design-system rule (no raw `gray-*` literals).

Preview is already switched to mobile so the changes are visible immediately; you can toggle back with the device button above the preview.
