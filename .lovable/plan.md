## Re-fix Quick Actions buttons — horizontal centered layout

The previous vertical stack overflowed the row's fixed height, pushing the icon above and helper text below the button. Switch back to a horizontal layout where the icon sits inline to the left and the label + helper text stack is vertically centered inside the button.

**File:** `src/pages/MaintenanceDashboardHome.tsx` (~lines 661–677)

### Changes

1. Button className → `w-full h-auto min-h-[60px] flex flex-row items-center justify-center gap-3 py-3 px-4` (row layout, centered content, comfortable padding).
2. Icon stays `h-5 w-5 shrink-0`, rendered inline before the text block.
3. Inner text wrapper → `flex flex-col items-start justify-center text-left min-w-0` so the two text lines stack tightly and are vertically centered next to the icon.
4. Keep label `text-sm font-semibold leading-tight` and helper `text-[11px] mt-0.5 leading-tight` (no truncate, so helper line is fully visible).

Result: icon and text sit on the same baseline-centered row, text is vertically centered inside each button, nothing overflows the card row.