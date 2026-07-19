## Goal
Wrap the Fleet Loads page in a cohesive master container with a neutral page background, generous responsive padding, and consistent vertical rhythm between the header, KPI grid, action bar, and table.

## Scope
Only `src/pages/FleetLoads.tsx`. No changes to `DashboardLayout` (which already provides `bg-background` and `p-2 sm:p-4 lg:p-6` for all pages), no changes to shared components, no logic changes.

## Changes

**`src/pages/FleetLoads.tsx`**
1. Wrap the entire returned page (Header + KPI grid + Action Bar + DataTable + dialogs where appropriate) in a single master `<div>`:
   - Neutral surface: `bg-slate-50 dark:bg-slate-900/40` with `rounded-xl` and a subtle `border border-border/50` so the white cards/table pop against it.
   - Negative-margin trick (`-m-2 sm:-m-4 lg:-m-6`) to cancel the parent `DashboardLayout` padding so the master container spans edge-to-edge inside the page frame.
   - Responsive inner padding: `p-4 sm:p-6 lg:p-8`.
   - Minimum height: `min-h-[calc(100vh-4rem)]` so the background fills the viewport when content is short.
2. Apply `space-y-6` on the master container so the Page Header, KPI grid, Action Bar, and DataTable card are separated by consistent vertical spacing. Remove any ad-hoc `mb-*` / `mt-*` currently used between those top-level blocks so spacing is driven exclusively by `space-y-6`.
3. Keep dialogs (Add Load, Edit Load, Archive Confirm, etc.) rendered as siblings outside the visual stack but inside the master container — they are portaled by Radix so they won't affect layout.
4. Dark mode: use semantic-friendly slate tokens above; do not hardcode any card/text colors — the existing KPI cards and DataTable already use `bg-card` and will contrast correctly.

## Technical Details
- Tailwind only; no new files, no new dependencies.
- Vertical flow target order inside the master container:
  1. Header block (title + subtext + right-side actions)
  2. KPI grid (`grid-cols-1 md:grid-cols-3 gap-6`)
  3. Action Bar (search/filter left, buttons right)
  4. DataTable card
- Mobile: `p-4` and `space-y-6` remain; the KPI grid already collapses to one column.

## Out of Scope
- Agency Loads and other pages (can be replicated later if desired).
- Any change to card styling, table styling, filters, or upload logic.
