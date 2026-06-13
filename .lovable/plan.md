## Plan

The Messages drawer bug comes from `src/components/ui/sheet.tsx`. `SheetContent` currently force-wraps all children in a single `<div class="flex-1 overflow-y-auto p-6">` that is not a flex column. So when a consumer (e.g. `DriverMessages`, `DriverChatSheet`) builds a header + scroll body + composer layout with `flex flex-col p-0`, those children land inside a non-flex scroll wrapper — `flex-1` does nothing, the composer falls below the viewport, and content slides under the sticky header.

### Task 1 — Fix `src/components/ui/sheet.tsx`
- Remove the hardcoded `p-6` from `sheetVariants` base.
- Make `SheetContent` itself the flex column scroll container:
  `cn(sheetVariants({side}), "flex flex-col h-full p-6 gap-0 overflow-y-auto", className)`
- Render `{children}` directly (delete the auto-wrap `<div>`).
- Keep the absolute `SheetPrimitive.Close` button (top-right, z-30) so it always sits above content.

### Task 2 — Header stays static, with breathing room
- `SheetHeader` keeps `sticky top-0 z-10 bg-background pr-12 pb-4`, plus negative-margin bleed (`-mx-6 -mt-6 px-6 pt-6`) so the sticky background spans the full width over the SheetContent padding. The X button cannot be overlapped.

### Task 3 — Scrollable body for custom layouts
- For sheets that need independent header/body/footer scroll regions (chat-style), consumers must opt into internal-only scrolling. Update `DriverMessages.tsx` and `DriverChatSheet.tsx` to add `overflow-hidden` to their `SheetContent` className. Their existing `<div className="flex-1 overflow-y-auto">` body now works correctly because `SheetContent` is a real flex column.
- All "simple" sheets (`AuditLogDetailSheet`, `OrgDetailSheet`, `TruckHistoryDrawer`, `NewWorkOrderSheet`, `ContactDetailSheet`, `TeamManagementTab`, `DriverDetailSheet`, `ContactDetailSheet`, `SettlementsTab`, `DriverRequestsCard`) keep working unchanged — they scroll the whole sheet, header stays pinned via `sticky`.

### Task 4 — Update memory
- Refresh `mem://technical/ui-sheet-structure` to reflect: `SheetContent` is the flex column + scroll container itself; auto-wrapper removed; chat-style sheets must add `overflow-hidden`.

### Validation
- Open the Messages drawer (driver dashboard): header is fixed, conversation list/thread scrolls beneath it, composer pins to the bottom.
- Open `DriverChatSheet`, `NewWorkOrderSheet`, `AuditLogDetailSheet`, and `SettlementsTab` view — each scrolls correctly with header pinned and X button always clickable.