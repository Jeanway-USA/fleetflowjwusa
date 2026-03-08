

## Fix: Vertical Centering + Investigate Data Display

### Root Cause — Vertical Centering
The `tdClass` includes `p-4` (standard) or `px-3 py-1` (compact), adding vertical padding that eats into the fixed row height. With a 48px row and 32px of vertical padding, the inner `flex items-center h-full` div only gets ~16px of usable height — so "centering" happens within a tiny band at the top of the cell, not the full row.

**Fix:** Remove vertical padding from `tdClass`. Keep only horizontal padding. The inner flex div with `h-full` and `items-center` will then center content across the full 48px/32px row height.

### Changes

**`src/components/shared/DataTable.tsx`**

1. Update `getDensityConfig`:
   - Standard: `tdClass` from `p-4 text-sm` → `px-4 text-sm` (remove vertical padding)
   - Compact: `tdClass` from `px-3 py-1 text-xs` → `px-3 text-xs` (remove py-1)
   - Same for `thClass` — remove vertical padding, keep only horizontal

2. The existing `<div className="flex items-center h-full">` wrapper inside each `<td>` will now correctly span the full cell height and vertically center content.

### "Random Numbers" Investigation
I reviewed all DataTable column definitions across FleetLoads, Trucks, Trailers, CRM, Incidents, Documents, and AgencyLoads. All columns that display formatted data have `render` functions. Columns without render functions (like `unit_number`, `make`, `model`, `year` in Trucks) correctly fall back to `String(item[col.key])` which displays the raw value. The data in the screenshot appears correct (Landstar IDs, dollar amounts, dates). If specific pages show wrong data, please let me know which page and I'll investigate further.

### Files Modified
| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Remove vertical padding from td/th classes so flex centering works across full row height |

