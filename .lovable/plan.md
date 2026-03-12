

## Plan: Fix Dialog & Sheet Scrolling for Mobile

### Problem
The current `dialog.tsx` puts `overflow-y-auto` on the entire `DialogPrimitive.Content`, which means the header (with close button) and footer (with action buttons) scroll away with the content. On mobile, users can't reach the submit button or close the dialog if content is long. Same issue exists for sheets.

### Solution
Restructure the base Dialog and Sheet components to use a **flex column layout** with a scrollable middle section, and make headers/footers sticky. Also add `pb-safe` padding for mobile keyboard handling.

---

### Changes

**1. `src/components/ui/dialog.tsx`**
- Change DialogContent from `overflow-y-auto` on the outer wrapper to a flex column layout
- Move `overflow-y-auto` off the Content wrapper (keep `max-h-[85vh]`)
- Add `flex flex-col` to the Content wrapper
- Make the close button use `sticky top-0` positioning with a background
- Update `DialogHeader` to include `sticky top-0 z-10 bg-background` and bottom border
- Update `DialogFooter` to include `sticky bottom-0 z-10 bg-background` and top border with padding
- Add a scrollable body wrapper concept — since we can't add a wrapper around `{children}`, the approach is: keep `overflow-y-auto` on the Content but make header/footer sticky within it

Refined approach (simpler, no breaking changes):
- Keep `overflow-y-auto max-h-[85vh]` on DialogContent
- Make `DialogHeader` sticky: add `sticky top-0 z-10 bg-background pb-4 border-b mb-4`
- Make `DialogFooter` sticky: add `sticky bottom-0 z-10 bg-background pt-4 border-t mt-4`
- Add `p-4 sm:p-6` with reduced top/bottom padding since header/footer handle their own spacing

**2. `src/components/ui/sheet.tsx`**
- Add `overflow-y-auto` to the base SheetContent (so individual consumers don't need it)
- Make `SheetHeader` sticky: `sticky top-0 z-10 bg-background pb-4`
- Make `SheetFooter` sticky: `sticky bottom-0 z-10 bg-background pt-4`
- Ensure close button stays visible by adjusting its z-index

**3. High-traffic consumers cleanup**
- `NewWorkOrderSheet.tsx` (line 263): Remove redundant `overflow-y-auto` from className since it's now in base
- `ContactDetailSheet.tsx` (line 35): Same cleanup
- `ContactFormDialog.tsx` (line 214): Remove redundant `max-h-[90vh] overflow-y-auto` since base handles it
- `ProofOfDeliveryDialog.tsx` (line 204): Remove redundant `max-h-[95vh] overflow-y-auto`

---

### Files Modified

| File | Change |
|------|--------|
| `dialog.tsx` | Sticky header/footer, flex layout |
| `sheet.tsx` | Base overflow-y-auto, sticky header/footer |
| `NewWorkOrderSheet.tsx` | Remove redundant overflow class |
| `ContactDetailSheet.tsx` | Remove redundant overflow class |
| `ContactFormDialog.tsx` | Remove redundant overflow/max-h classes |
| `ProofOfDeliveryDialog.tsx` | Remove redundant overflow/max-h classes |

