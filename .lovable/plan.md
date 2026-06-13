## Goal
Make the driver-facing UI comfortable for night driving by exposing a quick dark/light toggle in the driver's top bar, while confirming the existing theme system already honors the OS `prefers-color-scheme` setting.

## Audit findings
- `ThemeContext` (`src/contexts/ThemeContext.tsx`) already:
  - Defaults to `window.matchMedia('(prefers-color-scheme: dark)')` when no stored preference exists.
  - Persists the user choice to `localStorage` (`jeanway-theme`).
  - Toggles the `.dark` class on `<html>`, which drives all shadcn semantic tokens in `src/index.css` (background, card, foreground, border, primary, etc.).
- Dark tokens in `index.css` already provide high-contrast values (`--background 0 0% 7%`, `--foreground 45 10% 95%`, etc.) used by cards, tables, inputs, dialogs.
- A toggle exists in `DriverSettings`, but there is **no one-tap toggle in the driver dashboard header**. The driver dashboard (`src/pages/DriverDashboard.tsx`) renders its own compact header (greeting + refresh + notifications) and the ActiveLoadCard / ProofOfDeliveryDialog / DocumentScanButton screens inherit from it.

No color contrast violations were spotted — driver components already use semantic tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-warning/10`, etc.), so they invert cleanly.

## Changes

1. **New component** `src/components/shared/ThemeToggle.tsx`
   - Small icon-only `Button` (ghost, `h-8 w-8`) using `lucide-react` `Sun` / `Moon`.
   - Reads `theme` + `toggleTheme` from `useTheme()`.
   - `aria-label` + `title` reflect current state ("Switch to dark mode" / "Switch to light mode").
   - Smooth icon swap (no extra deps).

2. **`src/pages/DriverDashboard.tsx`**
   - Import and render `<ThemeToggle />` in the header actions row, immediately to the left of the existing refresh button so it sits in the driver's top navigation area on every driver screen that uses this header.

3. **No changes** to `ThemeContext`, `index.css`, or token usage — the existing system already:
   - Listens to `prefers-color-scheme` on first load.
   - Persists manual overrides.
   - Drives all driver views (ActiveLoadCard, ProofOfDeliveryDialog, DocumentScanButton, EndingOdometerDialog, StartingOdometerDialog) through semantic tokens.

## Out of scope
- No business logic, no DB, no edits to the global manager layout (it already has theme controls in settings).
- No restyling of existing components; they already pass contrast in both themes via semantic tokens.
