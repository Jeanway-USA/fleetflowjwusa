

## Plan: Comprehensive Mobile-Responsiveness Pass

This is a large cross-cutting change touching ~20 files. The approach is to make surgical, mobile-first Tailwind adjustments without altering any business logic or data.

---

### Task 1: Global Layout & Navigation

**`src/components/layout/DashboardLayout.tsx`**
- Line 198: Change `p-4 lg:p-6` to `p-2 sm:p-4 lg:p-6` for tighter mobile padding

**`src/components/shared/PageHeader.tsx`**
- Already uses `flex-col sm:flex-row` — looks good. Add `items-start sm:items-center` to the outer div for better mobile alignment of title vs actions.

**`src/components/layout/AppSidebar.tsx`**
- No changes needed — the Sidebar component already handles mobile overlay via the SidebarProvider. The SidebarTrigger is `lg:hidden` and sticky in the header.

---

### Task 2: Responsive Grids — Dashboards & KPI Cards

**`src/pages/DispatcherDashboard.tsx`**
- Stats grid (line 158): `grid-cols-2 lg:grid-cols-4` — already good, keeps 2-col on mobile.
- Map/Assignment/Alerts row (line 175): Change `md:grid-cols-2 lg:grid-cols-3` to `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (explicit mobile single-col).
- Driver/Truck status grid (line ~210): Change `md:grid-cols-2` to `grid-cols-1 md:grid-cols-2`.

**`src/pages/ExecutiveDashboard.tsx`**
- Health + KPI row (line 710): Already `grid-cols-1 lg:grid-cols-5` — good.
- Fleet/Driver status (line 720): Already `grid-cols-1 md:grid-cols-2` — good.
- Operations+Costs (line 729): Already `grid-cols-1 lg:grid-cols-2` — good.
- Actions/Performers/Insights (line 735): Already `grid-cols-1 lg:grid-cols-3` — good.
- Header row (line 690): Needs fix — `PageHeader` and the button/period selector are inside a `flex-col sm:flex-row` div, but `PageHeader` itself adds another flex wrapper. Flatten so buttons stack below title on mobile.

**`src/components/executive/RevenueKPICards.tsx`**
- Line 119: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` — already responsive.

**`src/components/executive/TopPerformerCards.tsx`**
- Line 78: `grid-cols-1 md:grid-cols-2` — already responsive.

**`src/pages/DriverDashboard.tsx`**
- GPS+Pay row (line 201): `md:grid-cols-2` — add explicit `grid-cols-1` prefix.
- Already well-structured for mobile with `max-w-4xl mx-auto`.

**`src/components/executive/PrintableExecutiveSummary.tsx`**
- Print-specific grids (`grid-cols-4`, `grid-cols-3`) — add `grid-cols-2 sm:grid-cols-4` etc. for screen responsiveness of the print preview.

**`src/pages/CompanyInsights.tsx`**
- Line 243: `md:grid-cols-2` → `grid-cols-1 md:grid-cols-2`
- Line 328: `md:grid-cols-4` → `grid-cols-2 md:grid-cols-4`
- Line 416: `md:grid-cols-3` → `grid-cols-1 sm:grid-cols-3`

**`src/pages/AgencyLoads.tsx`**
- Form grids (lines 217, 236, 246, 256, 266): All `grid-cols-2` — change to `grid-cols-1 sm:grid-cols-2` so form fields stack on mobile.

**`src/pages/Landing.tsx`**
- Stats grid (line 136): `grid-cols-2 md:grid-cols-4` — already good.
- Features grid (line 189): `sm:grid-cols-2 lg:grid-cols-3` — already good.

---

### Task 3: Modals, Dialogs, and Sheets

**`src/components/ui/dialog.tsx`** (global fix)
- Line 39: Add `max-h-[85vh] overflow-y-auto` to the base DialogContent class. Also add `w-[95vw] sm:w-full` to ensure mobile dialogs don't bleed off-screen.

**`src/components/ui/sheet.tsx`**
- Line 45 (right variant): Already `w-3/4 sm:max-w-sm` — update to `w-full sm:max-w-sm` so mobile sheets take full width.
- Line 43 (left variant): Same change — `w-full sm:max-w-sm`.

**Individual dialog consumers** (e.g., `Trucks.tsx` line 412 `max-w-lg`, `SettlementsTab.tsx` line 573 `max-w-2xl`): These will inherit the base mobile fix from dialog.tsx. No individual changes needed.

---

### Task 4: Touch Targets & Driver Forms

**`src/components/ui/input.tsx`**
- Line 12: Already `h-10`. Change to `h-11 sm:h-10` for larger touch targets on mobile.

**`src/components/ui/button.tsx`**
- Check default size height. If it's `h-10`, change to `h-11 sm:h-10` for default variant.

**`src/components/driver/SignaturePad.tsx`**
- Canvas (line 108-119): Already uses `w-full` with `touch-none` — canvas scales correctly. The fixed `width={400} height={150}` is the internal resolution, not display size. No change needed — it already works responsively.

**`src/components/driver/PhotoCapture.tsx`**
- Photo grid (line 98): `grid-cols-3` — change to `grid-cols-2 sm:grid-cols-3` for larger thumbnails on mobile.

**`src/components/driver/DVIRForm.tsx`**
- Inspection item checkboxes: Ensure touch targets are adequate. Add `min-h-[44px]` to checkbox row wrappers.

**`src/components/shared/ExpensesList.tsx`**
- Form grids (lines 171, 193, 230): `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`.

---

### Files Modified Summary

| File | Change |
|------|--------|
| `DashboardLayout.tsx` | Mobile padding |
| `PageHeader.tsx` | Mobile alignment |
| `dialog.tsx` | Global mobile-safe sizing + scroll |
| `sheet.tsx` | Full-width on mobile |
| `input.tsx` | Touch target height |
| `button.tsx` | Touch target height |
| `DispatcherDashboard.tsx` | Grid responsiveness |
| `ExecutiveDashboard.tsx` | Header layout fix |
| `DriverDashboard.tsx` | Explicit grid-cols-1 |
| `CompanyInsights.tsx` | Grid responsiveness |
| `AgencyLoads.tsx` | Form grid stacking |
| `PrintableExecutiveSummary.tsx` | Grid responsiveness |
| `PhotoCapture.tsx` | Photo grid columns |
| `DVIRForm.tsx` | Touch target sizing |
| `ExpensesList.tsx` | Form grid stacking |

