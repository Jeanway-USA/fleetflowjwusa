

## Plan: DriverComplianceHub + IFTA Audit Data Button

### 1. Database Migration — Add `mvr_expiry` to `drivers`

The drivers table already has `license_expiry`, `medical_card_expiry`, and `hazmat_expiry`, but no MVR (Motor Vehicle Record) date. Add a nullable `mvr_expiry date` column.

```sql
ALTER TABLE public.drivers ADD COLUMN mvr_expiry date;
```

### 2. Create `DriverComplianceHub` Component

**File: `src/components/safety/DriverComplianceHub.tsx`**

- Query `drivers` table selecting `id, first_name, last_name, status, license_expiry, medical_card_expiry, mvr_expiry`
- Render using the existing `DataTable` component with columns: Driver Name, CDL Expiry, Medical Card Expiry, Annual MVR Expiry
- Each date cell uses a color-coded `Badge`:
  - **Green** (`bg-success/10 text-success`): valid (> 30 days out)
  - **Yellow** (`bg-warning/10 text-warning`): expiring within 30 days
  - **Red** (`bg-destructive/10 text-destructive`): expired
  - **Gray**: no date set
- Wrap in a `Card` with header "Driver Compliance Hub"

### 3. Integrate into Safety Page

**File: `src/pages/Safety.tsx`**

- Import and render `<DriverComplianceHub />` below the incident trends chart and above the two-column section
- Full-width card

### 4. Add "Audit Data" Button to IFTAWorkflowStepper

**File: `src/components/ifta/IFTAWorkflowStepper.tsx`**

- Add new props: `onAuditData?: () => void`, `auditLoading?: boolean`
- Render a small "Audit Data" button (outline variant, `Search` icon) at the right end of the stepper bar
- Clicking it calls `onAuditData`

### 5. IFTA Audit Logic + Alert List

**File: `src/pages/IFTA.tsx`**

- Add `auditAlerts` state and `runAudit` function
- `runAudit` scans `quarterDeliveredLoads` (already fetched) and checks:
  1. **Missing intermediate stops**: loads with `notes` that have no `=== INTERMEDIATE STOPS ===` section and `booked_miles > 500` (long-haul likely multi-state)
  2. **Missing fuel purchases**: loads with no matching `fuel_purchases` record (by cross-referencing `load_id` in `expenses`)
- Results stored as an alert array, rendered in an `Alert` component below the stepper when non-empty
- Pass `onAuditData={runAudit}` and `auditLoading` to `IFTAWorkflowStepper`

### Files

| File | Action |
|---|---|
| Migration | Add `mvr_expiry date` column to `drivers` |
| `src/components/safety/DriverComplianceHub.tsx` | Create — compliance data table |
| `src/pages/Safety.tsx` | Edit — add DriverComplianceHub |
| `src/components/ifta/IFTAWorkflowStepper.tsx` | Edit — add Audit Data button |
| `src/pages/IFTA.tsx` | Edit — add audit logic + alert rendering |

