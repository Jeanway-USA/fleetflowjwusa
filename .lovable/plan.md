

## Prevent Page "Refresh" on Tab Switch

### Root Cause
The `QueryClient` in `src/App.tsx` (line 54) is instantiated with default settings. React Query's default behavior sets `refetchOnWindowFocus: true`, which triggers all active queries to refetch when the user returns to the tab. This causes loading spinners and re-renders that feel like a full page refresh.

### Fix

**File: `src/App.tsx` — line 54**

Change the QueryClient initialization from:
```ts
const queryClient = new QueryClient();
```
to:
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});
```

- `refetchOnWindowFocus: false` — stops queries from re-firing when the tab regains focus.
- `staleTime: 5 * 60 * 1000` — keeps cached data fresh for 5 minutes, reducing unnecessary network calls.

This is a single-line change in one file. No other files need modification.

