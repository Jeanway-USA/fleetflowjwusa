## Add "My Paystubs" to Weekly Performance Widget

Reuse the existing `MyPaystubsDialog` so flat-rate drivers (who see `WeeklyPerformanceWidget` instead of `DriverPayWidget`) also have access to their paystubs.

### Changes

1. **`src/components/driver/WeeklyPerformanceWidget.tsx`**
   - Extend props with `payRate: number` and `payType: string`.
   - Add `paystubsOpen` state and import `MyPaystubsDialog`.
   - Add a ghost **My Paystubs** button (with `Receipt` icon) in the `CardHeader`, matching the placement and styling used in `DriverPayWidget`.
   - Render `<MyPaystubsDialog>` at the end of the card, passing `driverId`, `driverName`, `payType`, `payRate`.

2. **`src/pages/DriverDashboard.tsx`** (or wherever `WeeklyPerformanceWidget` is mounted)
   - Pass `payRate={driver.pay_rate}` and `payType={driver.pay_type}` when `driver.pay_type === 'flat'`.

### Out of scope
- No changes to performance metrics, calculations, or the paystub dialog itself.
- No backend/API changes.
