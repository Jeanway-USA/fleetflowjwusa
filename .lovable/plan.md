# Fix: Fleet Loads Table Row Overlap

## Root cause

`DataTable` uses `@tanstack/react-virtual` with a **fixed** row height (48px standard / 32px compact). Each virtual row is absolutely positioned at `translateY(virtualRow.start)` with `height: virtualRow.size` — so its slot in the layout is exactly one row tall.

Inside each cell, content is rendered in a `<div class="flex items-center h-full">` with **no wrap control**. When a value is long enough to wrap onto a second line (in the screenshot: "Fri, Apr 24", "Grand Prairie, TX", "Siadrak Jean"), the text renders below the fixed 48px slot and visually bleeds into the next absolutely-positioned row.

This affects every `DataTable` consumer, but it shows up worst on Fleet Loads because that table has the most narrow, text-heavy columns (dates, city/state pairs, driver names).

## Fix

In `src/components/shared/DataTable.tsx`, force single-line rendering inside every body cell so content can never exceed the fixed row height:

- Body `<td>` gets `overflow-hidden` so overflowing children are clipped, not displayed outside the row.
- The inner content wrapper (currently `flex items-center h-full`) gets `min-w-0 whitespace-nowrap` so long strings stop wrapping, and text nodes get `truncate` (`overflow-hidden text-ellipsis`) so they end in an ellipsis instead of overflowing horizontally.
- Add a `title` attribute derived from the raw value when the cell is a plain string, so truncated content is still readable on hover.
- Header cells get the same `whitespace-nowrap` + `overflow-hidden` treatment for consistency.

No changes to page-level code, no schema changes, no column-definition changes. All existing `render` callbacks that already produce inline nodes (badges, action menus) keep working — they're already single-line by construction; the wrapper just stops giving them room to wrap.

## Out of scope

- Dynamic row heights (would require switching to `measureElement` and reworking the absolute-positioned virtualization; unnecessary for this issue).
- Column-specific width tuning on Fleet Loads (the generic clip fix resolves the overlap; individual columns can be widened later if truncation feels tight).
