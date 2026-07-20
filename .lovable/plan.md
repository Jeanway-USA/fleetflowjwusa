# Fleet Roster Tab — ELD Sync + HOS Clarity

Modernize the driver and truck status cards inside the existing Fleet Roster tab. The tab layout (Driver Status + Truck Status side-by-side on top, Driver Leaderboard full-width below) is already in place from the earlier tabbed refactor — this pass focuses on card content and clarity.

## Changes

### 1. `src/components/dispatcher/DriverStatusGrid.tsx`

**ELD Sync Indicator (new)**
- Derive an ELD sync state from `drivers.hos_last_updated` (existing column, already fetched):
  - `< 30 min` → **live** — solid green dot with a pinging halo (`animate-ping`) + "ELD live · <time> ago"
  - `< 4 h` → **recent** — solid green dot, no pulse + "ELD synced <time> ago"
  - `< 14 h` → **stale** — amber dot + "ELD stale · <time> ago"
  - null / `>= 14 h` → **offline** — gray dot + "ELD offline"
- Rendered as a compact row under the driver name, before the HOS badge row.

**HOS badge clarity**
- Rework `HOS_TONE_CLASSES` / `getHosState` so `No HOS` and `Pending Reset` use amber warning styling (`bg-warning/10 text-warning border-warning/20`) instead of muted gray, so they read as safety alerts.
- Keep the amber "≤6h remaining" and red "≤2h remaining" tones (already correct).
- Add an `AlertTriangle` icon inline with `No HOS` / `Pending Reset` to draw the eye.

### 2. `src/components/dispatcher/TruckStatusGrid.tsx`

**ELD Sync Indicator (new)**
- Extend the query to also fetch `hos_last_updated` from the joined `current_driver`.
- When a truck has an assigned driver, render the same ELD indicator (dot + relative timestamp) beneath the driver name.
- When unassigned, render a neutral "No ELD paired" chip so the field never disappears silently.

### 3. Shared helper: `src/components/dispatcher/eldSync.ts` (new)

Single source of truth used by both cards:

```ts
export type EldTone = 'live' | 'recent' | 'stale' | 'offline';
export function getEldSyncState(lastUpdated: string | null): {
  tone: EldTone;
  label: string;     // "ELD live · 4m ago" etc.
  dotClass: string;  // Tailwind classes
  pulse: boolean;
}
```

Prevents drift between driver and truck cards.

### 4. Fleet Roster tab (`src/pages/DispatcherDashboard.tsx`)

Verify — no structural change needed. Current tab already renders:

```
grid grid-cols-1 md:grid-cols-2   → DriverStatusGrid | TruckStatusGrid
full width                        → DriverLeaderboard
```

Only tweak: swap the wrapping div's `md:grid-cols-2` to keep the two cards balanced with `items-stretch` so ELD indicator rows don't cause height drift.

## Files Touched

- **New**: `src/components/dispatcher/eldSync.ts`
- **Edit**: `src/components/dispatcher/DriverStatusGrid.tsx` — ELD row, elevate No HOS / Pending Reset to warning tone
- **Edit**: `src/components/dispatcher/TruckStatusGrid.tsx` — join `hos_last_updated`, render ELD row
- **Edit**: `src/pages/DispatcherDashboard.tsx` — add `items-stretch` to the Fleet Roster grid (minor)

## Out of Scope

- No new columns or schema changes; uses existing `drivers.hos_last_updated`.
- No integration with an external ELD vendor API — the indicator reflects the freshness of the HOS data the system already stores.
- No changes to the leaderboard beyond it already spanning full width.
