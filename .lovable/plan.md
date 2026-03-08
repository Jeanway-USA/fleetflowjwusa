

## Fix: EOW Report printing as 3 pages instead of 1

### Root Cause

The `visibility: hidden` / `visibility: visible` approach keeps all DOM elements in the layout flow — the dialog overlay, backdrop, and the full-screen modal container all occupy space even though they're invisible. The browser's print engine sees the full viewport height of all these stacked elements and paginates accordingly.

### Fix

Two changes in `src/index.css` print styles:

1. Use `display: none` on `body > *` instead of `visibility: hidden` — this removes non-report elements from flow entirely
2. Reset the `.print-report` to be a static block with no min-height, removing the full-viewport sizing that the dialog forces

Updated `@media print` block:

```css
@media print {
  body > * {
    display: none !important;
  }
  .print-report {
    display: block !important;
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: auto;
    min-height: 0;
    overflow: visible;
    background: white !important;
    color: black !important;
    margin: 0;
    padding: 0;
  }
  .print-report,
  .print-report * {
    visibility: visible;
  }
  /* Ensure the dialog portal ancestor chain is visible */
  [data-radix-portal],
  [data-radix-portal] > *,
  [role="dialog"] {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    width: 100% !important;
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    transform: none !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }
  .print\:hidden {
    display: none !important;
  }
}
```

Also in `PrintableExecutiveSummary.tsx`, change `min-h-full` to `h-auto` on the outer div to avoid the container stretching to the dialog's full viewport height:

```tsx
<div className="print-report bg-white text-black h-auto">
```

### Files

| File | Action |
|---|---|
| `src/index.css` | Edit — rewrite `@media print` block |
| `src/components/executive/PrintableExecutiveSummary.tsx` | Edit — change `min-h-full` to `h-auto` |

