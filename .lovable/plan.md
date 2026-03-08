

## Fix: "Print Report" button text not visible until hover

The button uses `variant="outline"` which inherits the current theme's text color. Inside the dark-mode dialog, the text ends up dark-on-dark. The fix is straightforward:

**File: `src/components/executive/PrintableExecutiveSummary.tsx` (line 96)**

Change the Print Report button classes to ensure visible contrast — add explicit `bg-white` and strengthen `border-gray-400` so the button is clearly readable against the white toolbar without needing hover:

```tsx
<Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2 bg-white border-gray-400 text-black hover:bg-gray-100">
```

Also apply the same treatment to the Close button (line ~99) to keep them consistent:

```tsx
<Button variant="ghost" size="icon" onClick={onClose} className="text-black hover:bg-gray-100">
```

This is a one-line CSS class fix — the `bg-white` forces a white background regardless of the inherited theme context, making the text always readable.

