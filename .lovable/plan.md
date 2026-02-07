

## Plan: Expandable Notification Messages

### Problem
Currently, notification messages are truncated to a single line. Clicking a notification either navigates away (for `load_assigned` type) or does nothing visible (for other types like `request_response`). Drivers cannot read the full message or dispatcher comments on their detention/request responses.

### Solution
Add inline expand/collapse behavior to notifications that do not have a redirect destination. Clicking these notifications will toggle an expanded view showing the full message text, dispatcher notes, and request details.

### Changes to `src/components/driver/DriverNotifications.tsx`

1. **Add expanded state tracking**: Track which notification ID is currently expanded using local state (`expandedId`).

2. **Update click handler logic**:
   - If the notification type has a redirect (e.g., `load_assigned`), navigate as before.
   - Otherwise, toggle the expanded state for that notification and mark it as read.

3. **Update notification rendering**:
   - When collapsed: Show message with `truncate` (current behavior).
   - When expanded: Remove the `truncate` class so the full message wraps and is fully readable. Add a subtle visual indicator (e.g., slightly different background or a small chevron) so the driver knows they can collapse it again.

4. **Update notification icons**: Add type-specific icons for `request_response` (e.g., a message reply icon) and `detention_response` types, matching the same icon set used in the `DriverRequestsCard` (Clock, Home, CalendarDays, Wrench).

5. **Store `related_id` on request response notifications**: Update the dispatcher's notification creation in `DispatcherAlerts.tsx` to pass the `requestId` as `related_id` when creating request response notifications. This enables future linking if needed.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/driver/DriverNotifications.tsx` | Add expanded state, update click handler to toggle expansion for non-redirect notifications, show full message when expanded |
| `src/components/dispatcher/DispatcherAlerts.tsx` | Include `related_id: requestId` when inserting the driver notification on approve/deny |

### Technical Details

**State addition in DriverNotifications:**
- `const [expandedId, setExpandedId] = useState<string | null>(null)` to track which notification is expanded (only one at a time for cleaner UX in the narrow popover).

**Updated click handler:**
- Notifications with a navigation target (currently only `load_assigned`) continue to navigate.
- All other notification types toggle the `expandedId` state and mark as read.

**Expanded notification display:**
- The message `<p>` tag loses its `truncate` class and gains `whitespace-pre-wrap` for proper line-break rendering.
- A small chevron icon rotates to indicate expanded/collapsed state.
- The expanded area has a subtle background tint to visually distinguish the open notification.

**DispatcherAlerts.tsx notification insert change (line ~194):**
- Add `related_id: requestId` to the notification insert so the request is linked for future reference.

No database changes are required -- the `related_id` column already exists on the `driver_notifications` table and is nullable.

