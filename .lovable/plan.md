

## Build FactoringBatchBuilder Component

### Overview
A split-layout component with mock data that lets a driver select delivered loads and preview a factoring batch summary. Integrates into the Finance page's existing Factoring tab area.

### File: `src/components/finance/FactoringBatchBuilder.tsx` (Create)

**Left column — "Ready to Factor":**
- ScrollArea containing 5 mock load cards
- Each card: Checkbox, load number, broker name, delivery date, gross pay
- Two icon indicators per card: Rate Con (FileCheck2) and POD (Camera) — green if present, amber/red if missing
- If POD is missing: checkbox disabled, wrapped in Tooltip showing "POD required before factoring"
- One mock load missing POD to demo the disabled state

**Right column — "Current Batch Summary":**
- Card showing: loads selected count, total gross, factoring fee (2.5%), net payout
- Updates reactively as checkboxes are toggled
- Large primary Button at bottom: "Generate Factoring Schedule & Send" with Send icon

**Layout:** `grid grid-cols-1 lg:grid-cols-2 gap-6` — stacks on mobile, side-by-side on desktop.

**Mock data (5 loads):**
| # | Load | Broker | Date | Gross | Rate Con | POD |
|---|------|--------|------|-------|----------|-----|
| 1 | LD-4521 | TQL | 04/08/2026 | $3,200 | Yes | Yes |
| 2 | LD-4518 | Echo | 04/06/2026 | $2,750 | Yes | Yes |
| 3 | LD-4515 | CH Robinson | 04/04/2026 | $4,100 | Yes | No |
| 4 | LD-4510 | Coyote | 04/02/2026 | $1,950 | Yes | Yes |
| 5 | LD-4507 | XPO | 03/30/2026 | $3,600 | Yes | Yes |

**Components used:** Card, CardHeader, CardContent, CardTitle, Checkbox, Button, Badge, ScrollArea, Tooltip/TooltipTrigger/TooltipContent/TooltipProvider

### File: `src/pages/Finance.tsx` (Modify)
Import and render `FactoringBatchBuilder` inside the existing Factoring tab content area, above or below the current `FactoringTab` component.

