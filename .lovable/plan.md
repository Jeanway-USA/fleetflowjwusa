

## Fix Vertical Centering + Add Table Options Everywhere

### Problem 1: Vertical Centering
The `height: inherit` approach on `<td>` isn't reliably centering content. The issue: virtualized rows use `display: table` with absolute positioning, and `height: inherit` doesn't propagate consistently. Fix: use explicit `line-height` matching the row height instead, which guarantees vertical centering without relying on cell height inheritance.

### Problem 2: Missing Table Options
Currently only 4 pages use `DataTable` (Trucks, Trailers, Documents, AgencyLoads). Several major pages use raw `<Table>` components and lack density toggle, column visibility, and CSV export.

---

### Changes

**1. `src/components/shared/DataTable.tsx`** — Fix centering
- Remove `style={{ height: 'inherit' }}` from td/th
- Instead, add `line-height` to td cells that matches the row height, ensuring true vertical centering
- For compact: cells get `leading-[32px]`, standard: `leading-[48px]` — but since cells have padding, use flexbox: wrap cell content in a flex container with `items-center` and explicit `min-h` matching row height

Actually, simplest fix: change the td approach to use `display: flex; align-items: center` with the row height, since `vertical-align: middle` doesn't work reliably with absolute-positioned table rows.

**2. Add `tableId` + `exportFilename` to existing DataTable usages:**
- `src/pages/Trucks.tsx` — add `exportFilename="trucks"`
- `src/pages/Trailers.tsx` — add `exportFilename="trailers"`
- `src/pages/Documents.tsx` — add `exportFilename="documents"`
- `src/pages/AgencyLoads.tsx` — add `exportFilename="agency-loads"`

**3. Convert major raw-Table pages to DataTable:**

| Page | Current | Action |
|---|---|---|
| `src/pages/FleetLoads.tsx` | Raw `<Table>` with 12 columns + totals row | Convert to `DataTable` with `tableId="fleet-loads"` + `exportFilename="fleet-loads"`. Keep totals row as a separate summary below the table. |
| `src/pages/Incidents.tsx` | Raw `<Table>` | Convert to `DataTable` with `tableId="incidents"` + `exportFilename="incidents"` |
| `src/pages/CRM.tsx` | Raw `<Table>` | Convert to `DataTable` with `tableId="crm-contacts"` + `exportFilename="crm-contacts"` |

**4. Pages NOT converted** (specialized layouts with totals rows, P&L formatting, nested sub-tables):
- Finance tabs (Settlements, Payroll, Revenue, P&L) — deeply nested in tab components with custom footers
- IFTA — complex multi-tab with jurisdiction maps
- CompanyInsights, SuperAdmin — dashboard summary tables
- Maintenance tabs — inline status dropdowns, complete buttons

These use the raw `<Table>` component intentionally for their specialized layouts. Converting them would require significant restructuring of each component.

---

### Files Modified

| File | Action |
|---|---|
| `src/components/shared/DataTable.tsx` | Fix vertical centering with flex-based cell alignment |
| `src/pages/Trucks.tsx` | Add `exportFilename` |
| `src/pages/Trailers.tsx` | Add `exportFilename` |
| `src/pages/Documents.tsx` | Add `exportFilename` |
| `src/pages/AgencyLoads.tsx` | Add `exportFilename` |
| `src/pages/FleetLoads.tsx` | Convert main table to `DataTable` |
| `src/pages/Incidents.tsx` | Convert main table to `DataTable` |
| `src/pages/CRM.tsx` | Convert main table to `DataTable` |

