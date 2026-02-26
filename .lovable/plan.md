

## Filter 1099 Audit YTD Revenue to Delivered Loads Only

### Problem
The App YTD Revenue in the 1099 Audit Mode currently includes all loads regardless of status. Per the business rule that financial metrics should only include delivered loads, unfinished loads are inflating the total and creating a false variance.

### Change Required

**File: `src/components/finance/AuditReconciliation.tsx`**

Add `l.status !== 'delivered'` filter to the `ytdLoads` memo (line 37):

```typescript
// Before
.filter(l => {
  if (!l.pickup_date) return false;
  const d = parseISO(l.pickup_date);
  return d.getFullYear() === yearNum;
})

// After
.filter(l => {
  if (!l.pickup_date) return false;
  if (l.status !== 'delivered') return false;
  const d = parseISO(l.pickup_date);
  return d.getFullYear() === yearNum;
})
```

This single filter change will cascade through all downstream calculations: App YTD total, variance, gap analysis cards, and the load-by-load breakdown table — since they all derive from `ytdLoads`. The "Non-Delivered" gap analysis card will naturally show 0 since those loads are excluded. The "Total Loads (YTD)" count will also reflect only delivered loads.

