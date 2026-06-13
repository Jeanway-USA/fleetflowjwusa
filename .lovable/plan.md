# Global Sheet Layout Audit — Apply Safe Flex Pattern

## Goal
Refactor every Sheet consumer (except the excluded chat components and the core `ui/sheet.tsx`) to follow one consistent layout pattern so the `SheetHeader` and close X can never overlap body content, and long bodies always scroll inside their own region.

## Safe layout pattern (applied to each file)
Inside `<SheetContent>`:

```text
<SheetContent className="... flex flex-col p-0 gap-0">
  <SheetHeader className="shrink-0 px-6 pt-6 pb-4 pr-12 border-b">
    <SheetTitle/> <SheetDescription/>
  </SheetHeader>
  <div className="flex-1 overflow-y-auto px-6 py-4">
    {body / form / list}
  </div>
  {optional} <SheetFooter className="shrink-0 border-t px-6 py-4"/>
</SheetContent>
```

Key rules:
- `SheetContent` itself becomes the flex column (`flex flex-col p-0 gap-0`). We override the default `p-6` so the sticky header from `ui/sheet.tsx` no longer needs negative-margin bleed to clear the close button — we instead provide our own padding inside each region.
- `SheetHeader` keeps the global sticky styles, plus local `shrink-0 pr-12` to reserve room for the absolute X button.
- All scrollable content lives in a single `flex-1 overflow-y-auto` div so it cannot ride under the header.
- Existing `overflow-y-auto` on `SheetContent` is removed (would conflict with `flex-1` child).

## Files to update

1. `src/components/crm/ContactDetailSheet.tsx` — wrap the tabs/details body in `flex-1 overflow-y-auto`; switch `SheetContent` to flex column with `p-0`.
2. `src/components/drivers/DriverDetailSheet.tsx` — already has `flex flex-col overflow-y-auto`; move `overflow-y-auto` off `SheetContent` onto a new inner `flex-1` wrapper around the existing body.
3. `src/components/superadmin/AuditLogDetailSheet.tsx` — move `overflow-y-auto` from `SheetContent` to inner `flex-1` body wrapper.
4. `src/components/superadmin/OrgDetailSheet.tsx` — same refactor.
5. `src/components/maintenance/NewWorkOrderSheet.tsx` — large form; wrap form body in `flex-1 overflow-y-auto`, keep `SheetFooter` as static `shrink-0`.
6. `src/components/maintenance/TruckHistoryDrawer.tsx` — wrap tabs/history body in `flex-1 overflow-y-auto`.
7. `src/components/finance/SettlementsTab.tsx` — already uses `p-0` with `overflow-y-auto`; restructure into header / `flex-1 overflow-y-auto` body.
8. `src/components/settings/TeamManagementTab.tsx` — switch to flex column, body scroll, footer pinned via `shrink-0`.
9. `src/components/driver/DriverRequestsCard.tsx` — bottom sheet: keep `max-h-[90vh]`, switch to `flex flex-col`, body in `flex-1 overflow-y-auto`.
10. `src/pages/Incidents.tsx` — detail sheet: same refactor (move scroll off `SheetContent`).
11. `src/pages/MaintenanceManagement.tsx` — sidebar sheet already uses `p-0` + sr-only header; only ensure `flex flex-col h-full` so the embedded `<AppSidebar/>` fills available height.

## Explicitly excluded
- `src/components/ui/sheet.tsx` (per constraint)
- `src/components/driver/DriverMessages.tsx` and `src/components/drivers/DriverChatSheet.tsx` (custom fix already applied)
- `src/pages/Landing.tsx` (mobile nav menu — no header/scrollable body issue)

## Validation
Open each affected sheet in the preview, verify:
- Title and X button are fully visible and unclipped.
- Long content scrolls inside the body while header stays pinned.
- Footers (NewWorkOrder, TeamManagement) stay pinned at the bottom.
- No layout regressions on `sm:max-w-*` widths or `side="bottom"` variants.
