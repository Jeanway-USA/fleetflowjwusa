

## Plan: Show Miles, Hide Landstar ID on Mobile

Two column definition changes in `src/pages/FleetLoads.tsx`:

**1. Line 587** — Add `hiddenOnMobile: true` to the Landstar ID column:
```typescript
{ key: 'landstar_load_id', header: 'Landstar ID', hiddenOnMobile: true, render: ... }
```

**2. Line 624** — Remove `hiddenOnMobile: true` from the Miles column:
```typescript
{ key: 'miles', header: 'Miles', render: ... }
```

No logic or layout changes — just toggling two `hiddenOnMobile` flags.

