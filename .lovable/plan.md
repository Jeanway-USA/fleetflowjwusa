## Admin → Driver Chat on Driver Detail Sheet

Add a "Message Driver" button to the driver detail sheet that opens a second Sheet containing a realtime 1:1 chat between the current admin user and the selected driver.

### Components

**New: `src/components/drivers/DriverChatSheet.tsx`**
- Props: `driver`, `open`, `onOpenChange`
- A right-side `Sheet` (shadcn) with `w-full sm:max-w-md`, flex column layout, fixed header + scrollable thread + fixed composer (per existing dialog/sheet layout memory).
- Header: avatar + driver name + "Direct message" subtitle.
- Body: scrollable message list rendered chronologically (oldest → newest), with auto-scroll to bottom on new message. Sender vs receiver bubbles styled with semantic tokens (`bg-primary text-primary-foreground` for self, `bg-muted` for driver). Show `created_at` as relative time under each bubble.
- Empty state: "No messages yet. Say hello."
- Composer: `Textarea` + `Send` button. Enter sends, Shift+Enter newlines. Button disabled while empty or sending.
- Missing-account state: if `driver.user_id` is null, render a notice ("This driver has no linked login account yet — they will see messages once they accept their invitation.") and disable the composer. (Drivers can exist without a user account in this schema.)

**Data layer:**
- Fetch with TanStack Query, key `['driver-chat', authUser.id, driver.user_id]`.
- Query: `messages` table where `(sender_id = me AND receiver_id = driver.user_id) OR (sender_id = driver.user_id AND receiver_id = me)`, ordered by `created_at asc`.
- Send mutation: insert `{ sender_id: me, receiver_id: driver.user_id, content }`. `org_id` auto-fills via trigger. Optimistic append, rollback on error, toast on failure.
- Mark-as-read effect: when sheet is open, update any messages where `receiver_id = me AND sender_id = driver.user_id AND is_read = false` to `is_read = true`.

**Realtime:**
- On sheet open, subscribe to a channel `direct-msgs-${me}-${driver.user_id}` listening to `postgres_changes` on `public.messages` with `event: 'INSERT'`, filter `receiver_id=eq.${me}` (driver replies). On payload, if `sender_id` matches selected driver, append to cache and mark read.
- Also listen for `event: 'UPDATE'` to reflect read-state changes if needed.
- Unsubscribe on close/unmount.

### Wiring

**`src/components/drivers/DriverDetailSheet.tsx`**
- Add `MessageSquare` icon button next to the existing Edit button in the header (gated by `!readOnly`).
- Add local state `chatOpen` and render `<DriverChatSheet driver={driver} open={chatOpen} onOpenChange={setChatOpen} />` inside the component.
- Button click sets `chatOpen=true`. (Both Sheets can coexist — Radix stacks them; the chat sheet slides over.)

### Out of scope
- No new database schema (uses the `messages` table created in the previous task).
- No unread badge on the driver list (can be a follow-up).
- No file/image attachments.
- Driver-side chat UI (mirror component on the driver dashboard) is a separate task.

### Files touched
- New: `src/components/drivers/DriverChatSheet.tsx`
- Edit: `src/components/drivers/DriverDetailSheet.tsx` (add button + chat sheet wiring)