## Driver Messages Widget

Add a Messages button next to the existing notifications bell in the driver dashboard header, with an unread badge and a slide-out chat interface that mirrors the admin-side experience.

### New component: `src/components/driver/DriverMessages.tsx`

Trigger (rendered inside the `tour-notifications` cluster, beside `DriverNotifications`):
- Ghost icon `Button` (`h-8 w-8`) with `MessageSquare` icon.
- Red unread `Badge` overlay (top-right, count or "9+") computed from a TanStack Query that counts rows in `messages` where `receiver_id = driver.user_id AND is_read = false`. 30s refetch + realtime invalidation.

Panel: a right-side `Sheet`, `w-full sm:max-w-md`, two-mode body:

**Mode A — conversation list (default):**
- Group all messages involving the driver by counterpart `user_id` (the non-driver participant). For each thread show: counterpart name (from `profiles.first_name + last_name`, fallback email), last message preview, relative time, unread count badge.
- Single query: select messages for the driver + a separate `profiles` select for counterpart names, joined client-side.
- Tap a row → switch to Mode B for that counterpart.

**Mode B — thread view:**
- Header with back arrow, counterpart name, "Dispatch" subtitle.
- Scrollable message list, chronological. Own messages: `bg-primary text-primary-foreground` right-aligned. Admin messages: `bg-muted` left-aligned. Relative timestamp under each bubble. Auto-scroll to bottom.
- Composer: `Textarea` + `Send` button (Enter sends, Shift+Enter newline). Disabled while sending.
- On entering this mode (and on every new incoming message in it), update `messages` set `is_read = true` for unread rows where `receiver_id = me AND sender_id = counterpart`. Then invalidate the unread-count query.

### Data layer

- Auth: use `useAuth()` to get current user id (the driver's `user_id`).
- Queries (TanStack):
  - `['driver-msgs-unread', userId]` — `select id` count where `receiver_id = userId AND is_read = false`.
  - `['driver-msgs-threads', userId]` — all messages involving driver (`or(sender_id.eq,receiver_id.eq)`), ordered desc; reduced client-side into threads. Joined with `profiles` lookup for distinct counterpart ids.
  - `['driver-msgs-thread', userId, counterpartId]` — full thread, asc.
- Send mutation: insert `{ sender_id: userId, receiver_id: counterpartId, content }` (cast `as any` because the trigger fills `org_id` and the generated TS type still requires it).

### Realtime

A single channel subscribed for the lifetime of the component (mounted whenever the panel is open):
- `postgres_changes` INSERT on `public.messages` filtered `receiver_id=eq.${userId}`.
- On payload: invalidate the unread count, update threads list cache, and if the open thread matches `sender_id`, append to that cache + mark read.
- Also INSERT filtered `sender_id=eq.${userId}` so outgoing messages from other devices stay in sync.
- Unsubscribe on close.

### Wiring

Edit `src/pages/DriverDashboard.tsx`:
- Inside `<div id="tour-notifications">`, render `<DriverMessages />` next to `<DriverNotifications />` inside a small flex wrapper so they sit side-by-side.

### Out of scope
- Push notifications / sound.
- Group chats, attachments, typing indicators.
- A separate full page route.

### Files
- New: `src/components/driver/DriverMessages.tsx`
- Edit: `src/pages/DriverDashboard.tsx` (one-line addition inside tour-notifications)