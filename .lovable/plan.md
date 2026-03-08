

## Plan: Clean up NotificationCenter

### Changes

**1. Remove mock notifications (`src/components/shared/NotificationCenter.tsx`)**
- Replace `INITIAL_NOTIFICATIONS` with an empty array `[]`
- Keep all the component logic intact so it's ready for real data later

**2. Add `hideNotifications` prop to PageHeader (`src/components/shared/PageHeader.tsx`)**
- Add optional `hideNotifications?: boolean` to `PageHeaderProps`
- Conditionally render `<NotificationCenter />` only when `hideNotifications` is not `true`

**3. Suppress global bell on Maintenance page (`src/pages/MaintenanceManagement.tsx`)**
- Pass `hideNotifications` prop to `<PageHeader>` since the page already has its own PM notification bell

### Files

| File | Action |
|---|---|
| `src/components/shared/NotificationCenter.tsx` | Edit — empty the `INITIAL_NOTIFICATIONS` array |
| `src/components/shared/PageHeader.tsx` | Edit — add `hideNotifications` prop, conditionally render bell |
| `src/pages/MaintenanceManagement.tsx` | Edit — pass `hideNotifications` to PageHeader |

