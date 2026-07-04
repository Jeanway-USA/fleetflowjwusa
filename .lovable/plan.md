# Fix unstyled Gusto SDK rendering

## What's wrong

The SDK components are shipping plain-text — no layout, calendar overlaps the text, icons are broken — because **`@gusto/embedded-react-sdk/style.css` is never imported**. The SDK ships its styles as a separate CSS file that consumers must import once.

## Fix

Import the SDK stylesheet at the app entry so every embedded component picks up its layout, spacing, form controls, and calendar/popover styling.

## Technical details

Edit `src/main.tsx` (or wherever `index.css` is imported at app boot) and add:

```ts
import "@gusto/embedded-react-sdk/style.css";
```

That's the only change required — the CSS is scoped by the SDK and won't leak into FleetFlow styles. After the import, the Run W-2 Payroll dialog will render Gusto's proper card layout (blocker list, date-range picker, action buttons) inside our right pane instead of the raw plaintext seen in the screenshot.

## Out of scope

- No changes to the edge function, provider, or theme — the existing `gustoFleetFlowTheme` already themes the SDK once the base stylesheet loads.
