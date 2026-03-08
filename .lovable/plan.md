

## Add Tracking ID Column to Fleet Loads Table

### Problem
The `tracking_id` column exists in the database and is fetched via `select('*')`, but no column is defined in the DataTable on the Fleet Loads page.

### Fix — `src/pages/FleetLoads.tsx`
Add a new column after the "Landstar ID" column (line ~580) that displays a truncated tracking ID with a copy-to-clipboard action:

```tsx
{ key: 'tracking_id', header: 'Tracking ID', render: (load: any) => 
  load.tracking_id ? (
    <span 
      className="font-mono text-xs cursor-pointer hover:text-primary truncate max-w-[120px] inline-block"
      title={`Click to copy tracking link`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`${window.location.origin}/track?tracking_id=${load.tracking_id}`);
        toast.success('Tracking link copied!');
      }}
    >
      {load.tracking_id.slice(0, 8)}…
    </span>
  ) : <span className="text-muted-foreground">-</span>
},
```

### Files Modified
| File | Action |
|---|---|
| `src/pages/FleetLoads.tsx` | Add Tracking ID column to DataTable |

