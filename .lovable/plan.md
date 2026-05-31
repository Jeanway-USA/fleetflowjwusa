## Change

Replace the blue/grey fill-in input styling in `src/components/onboarding/DocumentTemplateRenderer.tsx` (the `FILL_IN_INPUT_CLASS` constant, lines 13-20) with a look that matches the rest of the site's gold/primary brand on the white document page.

### New styling

- Transparent background (no grey fill) so it sits cleanly on the white paper
- Gold underline using the brand primary color instead of blue
- Slate-900 text to stay readable on white
- Subtle gold tint on focus instead of blue background

```tsx
const FILL_IN_INPUT_CLASS =
  "inline-block h-7 sm:h-7 align-baseline w-auto min-w-0 " +
  "px-1 py-0 rounded-none border-0 border-b-2 border-primary/70 " +
  "bg-transparent " +
  "text-base sm:text-sm font-medium text-slate-900 " +
  "focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "focus-visible:border-primary focus-visible:bg-primary/5 " +
  "placeholder:text-slate-400 placeholder:font-normal";
```

No other files change. No logic changes.
