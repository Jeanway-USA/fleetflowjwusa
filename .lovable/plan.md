

## Plan: Mobile Shell & Navigation Polish

Most of the requested changes are **already in place** — the layout padding is `p-2 sm:p-4 lg:p-6`, PageHeader uses `flex-col sm:flex-row`, and the sidebar trigger is visible on mobile. A few refinements remain:

### Changes

**1. `src/components/shared/PageHeader.tsx`**
- Line 24: The actions container should be `w-full sm:w-auto` so buttons stretch full-width on mobile instead of floating inline
- Line 28: Action button gets `w-full sm:w-auto` for full-width tap target on phones
- Line 19: Increase mobile gap from `gap-2` to `gap-3` for better vertical separation

**2. `src/components/layout/DashboardLayout.tsx`**
- Line 173-196 (header): Reduce header height on mobile from `h-14` to `h-12 sm:h-14` to reclaim vertical space
- Line 175: Add `h-10 w-10` to SidebarTrigger for a reliable 40px touch target on mobile

**3. `src/components/layout/AppSidebar.tsx`** — no changes needed. The sidebar uses Shadcn's collapsible pattern and works correctly with the existing trigger.

### Summary
Three small Tailwind class updates across two files. No logic changes.

