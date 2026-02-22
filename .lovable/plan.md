

## Fix: Rapid Call Workflow Modal Too Narrow

The `RapidCallModal` dialog uses `sm:max-w-md` (448px), which is too narrow for long origin/destination addresses. The load summary and action buttons overflow horizontally.

### Change

**File: `src/components/dispatcher/RapidCallModal.tsx`**

- Change `sm:max-w-md` to `sm:max-w-lg` on the `DialogContent` to give the modal more breathing room (~512px).
- This single class change resolves the overflow for long address strings and the RPM badge placement.

