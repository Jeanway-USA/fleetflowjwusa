

## Load Optimizer Tool

A standalone calculator page where you can evaluate a potential Landstar load before booking it, using your real operational CPM from the Finance module.

### New Files

**`src/pages/LoadOptimizer.tsx`** — Full-page calculator with:
- **Input Section**: Gross Pay (rate), Miles, and Deadhead Miles fields
- **Revenue Calculation**: Uses `calculateRevenue()` from `src/lib/revenue-calculator.ts` for the Landstar split (truck %, trailer %, FSC), then applies `useOperationalCPM()` to compute True Net Profit
- **Deadhead Analysis**: Adds deadhead miles to loaded miles for total CPM impact; shows profit with and without deadhead
- **Go/No-Go Recommendation**: Pulls target margin from `company_settings` (new key `target_profit_margin`, default 15%). Displays a large green "GO" or red "NO-GO" badge based on whether the load exceeds the target margin
- **Breakdown Card**: Shows itemized costs — Landstar split, operational overhead (CPM x total miles), estimated driver pay, deadhead cost — and final True Net Profit

**Fields in the calculator form:**
- Gross Pay (linehaul rate)
- Fuel Surcharge (optional, default 0)
- Loaded Miles
- Deadhead Miles (miles to pickup)
- Power Only toggle

### Existing File Changes

**`src/components/layout/AppSidebar.tsx`**
- Add nav item: `{ title: 'Load Optimizer', icon: Calculator, path: '/load-optimizer', roles: ['owner', 'dispatcher'], feature: 'loads' }` in the `operationsItems` array

**`src/App.tsx`**
- Add lazy import and protected route for `/load-optimizer`

### Technical Details

- `useOperationalCPM()` provides the True CPM and `calculateTrueProfit()` helper
- `calculateRevenue()` handles the Landstar revenue split logic (truck %, trailer %, FSC passthrough)
- Target margin stored in `company_settings` as `target_profit_margin`; read via a simple supabase query with fallback to 15%
- No database migration needed — uses existing `company_settings` key-value store
- All calculation is client-side and instant as the user types (controlled inputs with `useMemo` for derived values)

### Files
| File | Action |
|------|--------|
| `src/pages/LoadOptimizer.tsx` | Create — calculator page |
| `src/App.tsx` | Add route |
| `src/components/layout/AppSidebar.tsx` | Add nav item |

