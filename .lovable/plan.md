

## Plan: Add "Help & Resources" Dropdown with Replay Tour Option

### Overview
Replace the existing "Take a Tour" ghost button in the dashboard header with a "Help & Resources" dropdown menu. The dropdown includes a "Replay Welcome Tour" option with a Compass icon that bypasses the DB check and starts the tour immediately.

### Changes

**`src/components/layout/DashboardLayout.tsx`**:
- Import `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator` from the existing dropdown-menu UI component
- Import `Compass` icon from lucide-react
- Replace the existing "Take a Tour" `<Button>` (lines 229-234) with a `<DropdownMenu>`:
  - Trigger: ghost button with `CircleHelp` icon + "Help" label
  - Menu item: `Compass` icon + "Replay Welcome Tour" — calls `tour.startTour()` on click
  - The dropdown renders regardless of whether `tourDef` exists for the current route (so it's always accessible), but the "Replay Welcome Tour" item is only shown when `tourDef` is available

### Files
| File | Action |
|------|--------|
| `src/components/layout/DashboardLayout.tsx` | Modify — replace tour button with dropdown menu |

