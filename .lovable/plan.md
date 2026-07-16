## Goal
Polish the existing shell (`DashboardLayout` + `AppSidebar`) into a cleaner, more consistent top-nav experience. Keep the current sidebar architecture — role-based menu, collapsible desktop, mobile sheet — since it already works. Focus the work on the **top bar**: a real global search input, notifications bell, theme toggle, and user profile dropdown, all in a consistent order across every page.

## Non-Goals
- No new pages, no new routes, no rewrite of `AppSidebar` role logic.
- No changes to business logic, data fetching, or auth.
- Not building a new notifications backend — reuse existing `NotificationCenter` / `DriverMessages`.
- Not replacing `CommandPalette` — the new search bar opens it.

## Changes

### 1. New header component: `src/components/layout/TopBar.tsx`
Extract the header out of `DashboardLayout` into a dedicated component so the layout file is readable and the header is reusable. Contents, left → right:

1. `SidebarTrigger` — visible on all breakpoints (currently `lg:hidden`). On desktop it collapses the sidebar to the icon rail; on mobile it opens the drawer. Solves the "sidebar can disappear" issue.
2. Breadcrumbs (existing `ROUTE_LABELS` / `ROUTE_GROUPS` logic moved in unchanged).
3. Flex spacer.
4. **Global search** — an actual `Input` with a `Search` icon (not a button that says "Search…"). Read-only trigger that dispatches `open-command-palette`; on `md+` shows the input, on mobile collapses to an icon button. Keeps ⌘K kbd hint.
5. `TimeDisplayToggle` (existing).
6. **Theme toggle** — reuse `src/components/shared/ThemeToggle.tsx`.
7. **Notifications** — role-aware slot:
   - drivers → existing `DriverMessages` bell (unchanged)
   - everyone else → existing `NotificationCenter` bell
   Both are already built; TopBar just picks one.
8. **User profile dropdown** — new small component. Avatar (initials from `user.email`) → dropdown with: role/email label, Settings (routes to `/settings` or `/driver-settings` based on role), Sign out. Replaces the standalone "Help" dropdown's sign-out affordance and consolidates account actions in one place. Help item ("Replay Welcome Tour") moves into this dropdown so we don't add another header button.

Ordering, spacing, and heights stay consistent with current header (`h-12 sm:h-14`, `gap-2`).

### 2. `DashboardLayout.tsx` slim-down
- Replace the inline `<header>` block (lines ~285–353) with `<TopBar />`.
- Keep the demo banner, impersonation banner, `DiscordBanner`, tour, welcome modal, error boundaries, and content padding exactly as-is.
- Keep `SidebarProvider` wrapper and the `⌘B` shortcut.

### 3. `AppSidebar.tsx` — minor polish only
- Ensure `collapsible="icon"` is set so desktop collapse leaves an icon rail (per shadcn sidebar guidance) — verify current setting and adjust if needed.
- No changes to the role-based menu items themselves.

### 4. Mobile behavior
- `SidebarProvider` already renders the sidebar as a `Sheet` under `md`. No new code needed; verified by making `SidebarTrigger` always visible.

### 5. Consistency sweep
- Confirm every route in `src/App.tsx` that renders through `ProtectedRoute` already gets `DashboardLayout` (per the project's "no page wraps itself in DashboardLayout" rule). No changes expected; note-only.

## Technical Details

- `TopBar` is a client component under `src/components/layout/TopBar.tsx`. It reads `useAuth`, `useLocation`, `useSubscriptionTier`, `useSidebar`, `useTheme` — same hooks the layout uses today.
- Search input is `<Input readOnly>` with `onClick`/`onFocus` dispatching `new CustomEvent('open-command-palette')`. Keeps a single source of truth (CommandPalette) and requires zero new search infra.
- Profile avatar uses `Avatar` + `AvatarFallback` from `@/components/ui/avatar` with initials derived from `user.email`. No image upload.
- All colors via semantic tokens (`bg-background/95`, `text-muted-foreground`, `border-border`) — no hardcoded colors.
- Only `code` changes; no DB migrations, no edge functions, no new secrets.

## Files Touched
- **new** `src/components/layout/TopBar.tsx`
- **new** `src/components/layout/UserMenu.tsx` (avatar + dropdown, kept small)
- **edit** `src/components/layout/DashboardLayout.tsx` (header block → `<TopBar />`)
- **edit (if needed)** `src/components/layout/AppSidebar.tsx` (ensure `collapsible="icon"`)

## Verification
- Load `/dispatcher-dashboard`, `/driver-dashboard`, `/fleet-loads`, `/settings` — header order identical, breadcrumbs correct, search opens palette, theme toggle switches, user menu signs out.
- Resize to mobile: sidebar becomes drawer via `SidebarTrigger`; search collapses to icon.
- Driver role sees `DriverMessages` bell; dispatcher/executive/admin see `NotificationCenter`.
