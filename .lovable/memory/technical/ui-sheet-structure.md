---
name: Sheet Structure
description: Global Sheet (src/components/ui/sheet.tsx) layout — SheetContent is itself the flex column + scroll container
type: technical
---
`SheetContent` is itself the vertical flex column and scroll container: `flex flex-col h-full p-6 overflow-y-auto scrollbar-hide`. It no longer auto-wraps children in an inner scroll div. The absolute `X` close button (z-30) sits above everything. `SheetHeader` is `sticky top-0 z-10 bg-background pb-4 -mx-6 -mt-6 px-6 pt-6 pr-12` so it pins to the top with a full-bleed background and never gets overlapped by the close button.

Simple sheets just put `<SheetHeader/>` then content — the whole panel scrolls and the header stays pinned. Chat-style sheets that need an internal-only scroll body + pinned composer must pass `overflow-hidden` to SheetContent (in addition to `p-0 flex flex-col`) so their inner `flex-1 overflow-y-auto` body works correctly. Examples: `DriverMessages.tsx`, `DriverChatSheet.tsx`.
