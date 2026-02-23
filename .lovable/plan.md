

## Fix: Add Ohio Valley Search Region

### Problem
There is an uncovered gap in the search grid between approximately lat 37-41 and lon -92 to -82, covering Ohio, Indiana, Kentucky, and West Virginia. No existing region covers this area:
- **Great Lakes** starts at lat 41 (too far north)
- **Gulf States** ends at lat 37 and lon -85 (doesn't reach west enough)
- **Upper Midwest** ends at lon -92 (doesn't reach east enough)
- **Mid-Atlantic** starts at lon -82 (doesn't reach west enough)

### Solution
Add one new region to `INITIAL_REGIONS` in `SyncMapModal.tsx`:

| Name | Bounds (S, W, N, E) | Coverage |
|------|---------------------|----------|
| Ohio Valley | 37.0, -92.0, 41.0, -82.0 | OH, IN, KY, WV |

This brings the total from 13 to 14 regions.

### Technical Detail
**File:** `src/components/superadmin/SyncMapModal.tsx`

Append to the `INITIAL_REGIONS` array:
```typescript
{ name: 'Ohio Valley', bbox: [37.0, -92.0, 41.0, -82.0] },
```

No other files need changes -- the UI already uses `regions.length` dynamically for progress display.
