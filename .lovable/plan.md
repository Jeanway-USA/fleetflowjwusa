

## Sort Loads Newest-First and Show Date

### Changes to `src/components/finance/LoadProfitabilityTab.tsx`

1. **Sort by date descending** (line 115): Change the sort from `a.trueNetIncome - b.trueNetIncome` to compare `pickupDate` newest-first:
   ```ts
   .sort((a, b) => (b.pickupDate || '').localeCompare(a.pickupDate || ''))
   ```

2. **Add Date column to table header** (line 258): Add a `<TableHead>Date</TableHead>` column after "Load".

3. **Add Date column to table body** (line 279): After the Load cell, add:
   ```tsx
   <TableCell className="text-sm text-muted-foreground">
     {lp.pickupDate ? format(parseISO(lp.pickupDate), 'MMM d, yyyy') : '—'}
   </TableCell>
   ```

4. **Update colspan** for the empty-state row (line 271) to account for the new column (+1).

