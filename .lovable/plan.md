# Reusable Toast System (semantic `notify` wrapper on sonner)

The app already renders `<Sonner />` globally in `App.tsx` and ~109 files import `toast` from `sonner`. This plan adds a thin, typed, on-brand wrapper without touching existing call sites.

## Changes

### 1. `src/components/ui/sonner.tsx` — position + richColors
Configure the global Toaster:
- `position="bottom-right"`
- `richColors` (enables semantic success/error/warning/info tinting that respects dark mode via CSS vars)
- `closeButton`
- `expand={false}`, `visibleToasts={4}`
- Keep the existing `classNames` styling on the base toast (border/shadow/foreground) so custom `toast()` calls still look on-brand; rich color variants override background/foreground per type.

No changes to how sonner is mounted in `App.tsx`.

### 2. `src/lib/notify.ts` — new semantic wrapper
Single file exporting a `notify` object plus a `useNotify()` hook (returns the same object — components can `import { notify }` or `const notify = useNotify()`; both work).

API:
```ts
notify.success(message, opts?)
notify.error(message, opts?)     // longer default duration (7s)
notify.warning(message, opts?)
notify.info(message, opts?)
notify.loading(message, opts?)
notify.promise(promise, { loading, success, error })
notify.dismiss(id?)

// Undo helper — matches how Archive already works elsewhere in the app.
notify.undo(message, onUndo, opts?)   // 10s default, matches archive undo window

// Generic action button
notify.action(message, { label, onClick, type? }, opts?)
```

`opts` is a subset of sonner's `ExternalToast`: `{ description?, duration?, id?, important? }`. No new deps.

### 3. Documentation
Add short JSDoc on each method with examples so autocomplete surfaces usage. No separate README.

## Explicitly out of scope

- No migration of existing 109 `toast(...)` sites — they keep working unchanged.
- No changes to the legacy shadcn `use-toast` / `<Toaster />` (still mounted, still functional for its ~5 callers).
- No changes to `App.tsx`, business logic, or any page code.
- No new context — sonner is already global; a plain module export + trivial hook is enough.

## Technical notes

- `richColors` uses sonner's CSS variables that already resolve from `--background`, `--foreground`, etc., so dark theme works with no extra styling.
- Undo helper builds on sonner's built-in `action: { label, onClick }`; if user doesn't click within `duration`, no callback fires — matching current `soft-delete` archive UX.
- Wrapper returns the sonner toast id (`string | number`) so callers can programmatically `dismiss(id)`.
