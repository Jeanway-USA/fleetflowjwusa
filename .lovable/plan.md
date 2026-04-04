

## Dynamic Landstar / Independent Terminology

### Approach
Use the existing `useOrganizationMode()` hook (already provides `isLandstar` flag) to conditionally render Landstar-specific labels. No new hooks or constants needed.

### Changes

#### 1. `src/pages/FleetLoads.tsx`
- Line 592: Table column header `'Landstar ID'` → `isLandstar ? 'Landstar ID' : 'Load ID'`
- Line 761: Form label `'Landstar Load ID'` → `isLandstar ? 'Landstar Load ID' : 'Load ID'`
- Import `useOrganizationMode` at top

#### 2. `src/components/finance/StatementUpload.tsx`
- Line 259: Card title `'Import from Landstar Statements'` → `isLandstar ? 'Import from Landstar Statements' : 'Import from Statements'`
- Import `useOrganizationMode`

#### 3. `src/components/finance/SettlementsTab.tsx`
- Line 399: Toast message referencing "Landstar statement" → dynamic
- Import `useOrganizationMode`

#### 4. `src/components/loads/RateConfirmationUpload.tsx`
- Any UI labels referencing "Landstar" in the upload card → dynamic (e.g., "Load ID" label at line 410)
- Import `useOrganizationMode`

#### 5. `src/components/layout/AppSidebar.tsx`
- Verify sidebar labels are already mode-aware (the CRM label already switches per memory context). No Landstar-specific load/revenue labels to change — confirm and leave as-is if clean.

### Not in scope
- Database column names (`landstar_load_id`) remain unchanged — these are internal identifiers
- Landing page marketing copy stays Landstar-branded (public-facing, not org-specific)
- Driver Settings Landstar Portal section — only shown in Landstar mode already (or should be gated separately)
- Edge function internals (`parse-landstar-statement`) — backend naming, not user-facing

### Pattern
Each file adds:
```tsx
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
// inside component:
const { isLandstar } = useOrganizationMode();
// then:
{isLandstar ? 'Landstar Load ID' : 'Load ID'}
```

