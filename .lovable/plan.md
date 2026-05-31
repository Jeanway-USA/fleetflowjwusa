## Fix washed-out document text

**File:** `src/components/onboarding/DocumentTemplateRenderer.tsx`

The document paper is white, but the renderer's root wrapper (line 165) applies `text-foreground`, which resolves to a light color in dark mode and washes out the prose.

### Change

Line 165 — swap `text-foreground` for a fixed dark color so the body always reads as black-on-white regardless of theme:

```tsx
<div className="text-slate-900 leading-relaxed">
```

That's the whole fix. No other files, no logic changes — the headings/paragraphs/list items below inherit color from this root, so they all turn crisp black immediately.