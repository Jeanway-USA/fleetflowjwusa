

## Quick Actions: Open Dialogs Instead of Just Navigating

### Approach
Use URL search params as a signal. The CommandPalette navigates with `?action=<name>`, and each target page reads `searchParams` on mount to auto-open the relevant dialog/sheet.

### Changes

**1. `src/components/shared/CommandPalette.tsx`**
- Change quick action items to include query params instead of bare paths:
  - "New Load" → `/fleet-loads?action=new-load`
  - "Upload Expense Report" → `/finance?action=new-expense`
  - "New Maintenance Request" → `/maintenance?action=new-work-order`

**2. `src/pages/FleetLoads.tsx`**
- Import `useSearchParams` from react-router-dom
- Add a `useEffect` that checks for `action=new-load` search param on mount, calls `openDialog()` (the existing new-load opener), then clears the param

**3. `src/pages/Finance.tsx`**
- Import `useSearchParams`
- Add a `useEffect` that checks for `action=new-expense`, calls `openExpenseDialog()`, then clears the param

**4. `src/pages/MaintenanceManagement.tsx`**
- Import `useSearchParams`
- Add a `useEffect` that checks for `action=new-work-order`, calls `setNewWorkOrderOpen(true)`, then clears the param

### Pattern (same in all 3 pages)
```typescript
const [searchParams, setSearchParams] = useSearchParams();

useEffect(() => {
  const action = searchParams.get('action');
  if (action === 'new-load') {
    openDialog(); // existing function
    setSearchParams({}, { replace: true }); // clean URL
  }
}, [searchParams]);
```

### Files Modified
| File | Change |
|---|---|
| `src/components/shared/CommandPalette.tsx` | Update quick action paths to include `?action=` params |
| `src/pages/FleetLoads.tsx` | Add useEffect to auto-open new load dialog from search param |
| `src/pages/Finance.tsx` | Add useEffect to auto-open expense dialog from search param |
| `src/pages/MaintenanceManagement.tsx` | Add useEffect to auto-open work order sheet from search param |

