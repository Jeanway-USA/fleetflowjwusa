## Cause
`src/components/driver/ActiveLoadCard.tsx` violates the Rules of Hooks:

- Lines 154–161 call 8 hooks (6× `useState`, `useOfflineQueue`, `useOptimisticLoadStatus`).
- Line 163: `if (!load) return <No Active Load card />;` — early return.
- Line 181: `usePaySettings()` is called **after** the early return.

While the driver had an active load, React saw 9 hooks. The moment they tap "Mark Delivered" and the query refetches, `activeLoad` becomes undefined → only 8 hooks run → React throws "Rendered fewer hooks than expected", which the surrounding `ErrorBoundary` displays as "Something went wrong loading this section".

## Fix
Single-file change in `src/components/driver/ActiveLoadCard.tsx`:

1. Move `const paySettings = usePaySettings();` up to sit alongside the other hooks at the top of the component (right after `useOptimisticLoadStatus`).
2. Keep the `payBreakdown` / `estimatedPay` derivation where it is — those aren't hooks and depend on `load`, so they stay after the `if (!load)` guard.

Result: hook order is identical on every render whether or not `load` is defined.

## Out of scope
- No other components touched. No query, RLS, or layout changes.
- No new error boundaries — the existing one is correct; we're removing the cause.

## Verification
1. Driver dashboard with an active load → "Mark Delivered" → card transitions to "No Active Load" with no error banner.
2. Refresh the dashboard while no load is active → still renders cleanly.
