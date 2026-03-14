

## Fix: Filter POD Missing Count by `pod_required` Flag

### Problem
The Morning Briefing widget counts all delivered loads missing POD documents, regardless of whether `pod_required` is true or false on the load. Loads with `pod_required = false` should be excluded.

### Solution
Add `.eq('pod_required', true)` to both queries that fetch delivered loads in the `MorningBriefingWidget.tsx`:

1. **Line 58-61** — the initial count query for `missingPods`: add `.eq('pod_required', true)`
2. **Lines 77-82** — the follow-up query fetching delivered load IDs: add `.eq('pod_required', true)`

This ensures only loads that actually require a POD are counted as "missing."

| File | Change |
|------|--------|
| `src/components/executive/MorningBriefingWidget.tsx` | Add `.eq('pod_required', true)` filter to both delivered-loads queries (lines ~58-61 and ~77-82) |

