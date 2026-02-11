

# Fix: Duplicate Load Detection Not Working

## Problem
When uploading a rate confirmation for load #6296517, the system says "Rate confirmation parsed successfully!" instead of detecting the existing load. The database confirms load 6296517 exists.

## Root Cause
The duplicate detection at line 130 compares `data.landstar_load_id` against the `existingLoads` prop, which is derived from the parent component's `loads` query. There are two likely causes:

1. **Stale published code**: The console logs show `[RC Upload] Attempting base64 JSON invoke, payload ~145KB` which is from a previous code iteration, suggesting the published site may not have the latest code deployed yet. **You must publish before testing on the live site.**

2. **Client-side-only matching is fragile**: The current approach relies entirely on the `existingLoads` array being fully loaded and passed as a prop. If the query hasn't completed, or if the array is somehow empty/stale, the match silently fails with no feedback.

## Solution
Make duplicate detection more robust by adding a **direct database check** in addition to the client-side match. After parsing the PDF, query the database for any load with the same `landstar_load_id` instead of relying solely on the pre-fetched prop array.

## Technical Details

### File: `src/components/loads/RateConfirmationUpload.tsx`

After extracting the data (line 126-143), replace the client-side-only `existingLoads.find()` with a database query:

```typescript
// After: setExtractedData(data);

if (data.landstar_load_id) {
  // Query database directly for reliable duplicate detection
  const { data: existingRows } = await supabase
    .from('fleet_loads')
    .select('id, landstar_load_id, origin, destination, rate, pickup_date')
    .eq('landstar_load_id', data.landstar_load_id)
    .limit(1);

  const existingLoad = existingRows?.[0] || 
    existingLoads.find(load => load.landstar_load_id === data.landstar_load_id);

  if (existingLoad) {
    setMatchingLoad(existingLoad);
    toast.info(`Found existing load with Freight Bill #${data.landstar_load_id}`);
  } else {
    setMatchingLoad(null);
    toast.success('Rate confirmation parsed successfully!');
  }
}
```

This ensures duplicate detection works even if:
- The `existingLoads` prop is empty or stale
- The loads query hasn't finished loading
- The published site has a slightly different query result

### Files Modified
- `src/components/loads/RateConfirmationUpload.tsx` -- add database-level duplicate check as primary method, keep client-side check as fallback

