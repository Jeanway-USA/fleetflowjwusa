

## Plan: Global NotificationCenter Dropdown in PageHeader

### 1. Create `NotificationCenter` component

**File: `src/components/shared/NotificationCenter.tsx`**

A self-contained Popover dropdown with:
- **Bell icon button** with a red unread count badge (absolute-positioned)
- **Tabs** inside the popover: All, Loads, Maintenance, System
- **Mock notifications state** using `useState` — seeded with ~6 sample notifications across categories, each with `id`, `title`, `message`, `category`, `isRead`, `createdAt`
- **"Mark all as read" button** in the header that sets all `isRead = true`, clearing the badge
- Each notification row: icon (by category), title, message preview, relative timestamp, unread dot
- Clicking a notification marks it as read individually
- Uses existing `Popover`, `Tabs`, `Badge`, `ScrollArea`, `Button` components — no new dependencies

### 2. Add NotificationCenter to PageHeader

**File: `src/components/shared/PageHeader.tsx`**

- Import and render `<NotificationCenter />` inside the right-side `flex items-center gap-2` div, before `{children}`

### Files

| File | Action |
|---|---|
| `src/components/shared/NotificationCenter.tsx` | Create |
| `src/components/shared/PageHeader.tsx` | Edit — add NotificationCenter |

