

## Fix: 120-Day Inspection Tooltip Clipping Into Table Header

### Problem
The tooltip on the 120-Day Inspection column defaults to `side="top"`, which causes it to render upward into the table header row when the truck is near the top of the table.

### Fix (`src/pages/Trucks.tsx`)
Add `side="bottom"` to the `TooltipContent` components in the 120-Day Inspection column render function (lines 266 and 294). This forces the tooltip to appear below the trigger instead of above, avoiding the header overlap.

Two instances to update:
- Line 266: `<TooltipContent side="bottom">` (the "Never Inspected" case)
- Line 294: `<TooltipContent side="bottom">` (the days remaining case)

Single file, two one-word additions.

