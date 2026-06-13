### Task 1 — Database read receipts
`public.messages` already has a `NOT NULL is_read boolean`, and both `DriverMessages.tsx` and `DriverChatSheet.tsx` already run an `UPDATE messages SET is_read=true` when the active thread is opened. **No schema migration or new mark-as-read logic is needed.** I'll keep the existing behavior and only invalidate the dispatcher's thread cache via realtime (see Task 2).

### Task 2 — Dispatcher "Delivered / Read" indicator
Edit `src/components/drivers/DriverChatSheet.tsx`:
- Under every outgoing bubble (`mine === true`), render a small status line:
  - `✓ Delivered` (single check, muted) when `is_read === false`
  - `✓✓ Read` (double check, primary color) when `is_read === true`
  - Use `Check` / `CheckCheck` icons from `lucide-react` plus the existing timestamp.
- Extend the existing realtime channel to also listen for `UPDATE` events on `messages` filtered by `sender_id=eq.${me}` (the dispatcher's own outbound messages). On each update, patch the cached `Message[]` so `is_read` flips live the instant the driver opens the chat — no refetch needed.
- Same treatment applied to outgoing bubbles in `src/components/driver/DriverMessages.tsx` (Tier 1 symmetry — drivers also see ✓✓ once dispatch reads their replies).

### Task 3 — Persistent driver unread badge
Today `<DriverMessages />` lives inside the dashboard header only, so it disappears on `/driver-settings`. Move it so it's persistent for every driver-facing page:
- In `src/components/layout/DashboardLayout.tsx`, render `<DriverMessages />` in the top-bar action area when the active user has the `driver` role (use existing role context). On the dashboard, remove the duplicated mount so it appears only once.
- The button itself already shows a red destructive `Badge` driven by a `useQuery` against `messages` where `receiver_id = me AND is_read = false` with a 60s refetch + realtime invalidation. No badge logic changes needed — just relocation guarantees it's visible across all driver routes.

### Task 4 — Audio chime on incoming message
- Add a small royalty-free chime to `public/sounds/message-chime.mp3` (downloaded via curl from a CC0 source during build).
- In `src/components/driver/DriverMessages.tsx`, create a lazy `audioRef` (`new Audio('/sounds/message-chime.mp3')` initialized inside a `useEffect` so SSR safety is preserved). Set `audio.preload = 'auto'` and `audio.volume = 0.6`.
- Inside the existing realtime `INSERT` handler, when the new message's `receiver_id === me` **and** the sheet is closed (`!open`), call:
  ```ts
  audioRef.current?.play().catch(() => { /* autoplay blocked — ignore */ });
  ```
- The `.catch()` block silently swallows the `NotAllowedError` browsers throw before any user gesture, so the app never crashes.

### Verification checklist
- Dispatcher sends a message → bubble shows `✓ Delivered`. Driver opens chat → dispatcher bubble updates live to `✓✓ Read` via the new UPDATE subscription.
- Driver navigates to `/driver-settings` → the messages button + unread badge stays visible in the top bar; opening it loads the same threads and clears the badge.
- Driver receives a new message with the chat sheet closed → the chime plays once; receiving with the sheet open does not play (avoids noise during active chatting).
- Browsers that block autoplay log nothing user-visible; the message still arrives and the badge still increments.