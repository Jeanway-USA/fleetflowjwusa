

## Plan: Predictive Service Calendar + DVIR-to-Work-Order Conversion

### Feature 1: Predictive Service Calendar

**Concept**: Calculate average daily mileage per truck from `fleet_loads` delivery history, then project when each PM threshold will be reached.

**New file: `src/components/maintenance/PredictiveServiceCalendar.tsx`**
- Query `fleet_loads` for each truck to compute avg daily mileage: `(sum of actual_miles) / (days between first and last delivery)`
- Query `service_schedules` + `manufacturer_pm_profiles` to get current miles-since-service and interval thresholds
- For each service: `remaining_miles = interval - miles_since_service`, then `projected_date = today + (remaining_miles / avg_daily_miles)`
- Render a calendar-style grid (next 90 days) with colored markers per truck/service
- Include a list view fallback showing truck, service name, projected date, and confidence indicator (based on data quality)

**Integration in PMNotificationsPanel**: Add a "Predictive Calendar" link/button at the top of the panel that navigates or toggles to this view.

**Integration in MaintenanceManagement.tsx**: Add as a sub-tab or section within the PM Schedule tab, toggled via a "Predictive View" button.

### Feature 2: DefectAlerts "Convert to Work Order"

**Changes to `src/components/maintenance/NewWorkOrderSheet.tsx`**:
- Add optional `initialData` prop: `{ truck_id?: string; description?: string; service_types?: string[] }`
- When `initialData` is provided, pre-populate `formData` state on open via a `useEffect`

**Changes to `src/components/safety/DefectAlerts.tsx`**:
- Add a "Convert to Work Order" button on each alert
- Accept an `onConvertToWorkOrder` callback prop that passes `{ truck_id, description }` from the inspection

**Changes to `src/pages/Safety.tsx`**:
- Add state for `NewWorkOrderSheet` (open + initialData)
- Pass `onConvertToWorkOrder` to `DefectAlerts`, which opens the sheet with pre-populated data

### Files Modified/Created

| File | Action |
|---|---|
| `src/components/maintenance/PredictiveServiceCalendar.tsx` | Create — calendar view with mileage projections |
| `src/components/maintenance/PMNotificationsPanel.tsx` | Edit — add link to predictive calendar |
| `src/pages/MaintenanceManagement.tsx` | Edit — integrate predictive calendar + handle defect work order flow |
| `src/components/maintenance/NewWorkOrderSheet.tsx` | Edit — accept optional `initialData` prop for pre-population |
| `src/components/safety/DefectAlerts.tsx` | Edit — add "Convert to Work Order" button with callback |
| `src/pages/Safety.tsx` | Edit — wire up DefectAlerts callback to NewWorkOrderSheet |

### Data Flow

```text
DefectAlerts → onConvertToWorkOrder({ truck_id, description })
  → Safety.tsx sets initialData + opens NewWorkOrderSheet
  → Sheet pre-fills truck + description from DVIR

PredictiveServiceCalendar:
  fleet_loads (delivered) → avg_daily_miles per truck
  service_schedules → remaining_miles per service
  projected_date = today + remaining_miles / avg_daily_miles
```

