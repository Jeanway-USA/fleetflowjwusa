## Fix unreadable Clear button on the white document page

**File:** `src/components/driver/SignaturePad.tsx` (lines 137–146)

### Root cause
The Clear button uses shadcn's `variant="outline"`, which pulls `bg-background` / `text-foreground` from the active theme. The SignaturePad now lives inside the document renderer that forces a fixed white page (`text-slate-900`), so in dark mode the button renders as a dark box with dark text on white paper — exactly the unreadable "black box" in the screenshot.

### Fix
Pin the Clear button to explicit light colors so it always reads on the white document page, matching the rest of the document body:

```tsx
className="w-full sm:w-auto bg-white text-slate-900 border-slate-300 hover:bg-slate-100 hover:text-slate-900"
```

One className change, on the Clear button only. The Confirm button is unaffected (its gold gradient already reads on white). No other files, no logic changes.
