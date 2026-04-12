

## Fix Stale Inspection Alert in Dispatcher Dashboard

### Problem
The Dispatcher Alerts component uses the legacy `next_inspection_date` column from the `trucks` table to determine if an inspection is due. This field is stale (`2026-04-11`) and is not updated when work orders are completed. The actual source of truth is the `service_schedules` table, where `last_performed_date` is `2026-04-09` and the interval is 120 days, meaning the next inspection is not due until ~August 2026 (117 days away).

### Fix
Update `DispatcherAlerts.tsx` (lines 171-188) to query `service_schedules` instead of relying on `trucks.next_inspection_date`.

Replace the truck inspection alert logic with:
1. Query `service_schedules` for `120-Day Inspection` rows joined with `trucks` (unit_number, status)
2. Calculate the actual next due date as `last_performed_date + interval_days`
3. Only generate an alert if that calculated date falls within 14 days

### File to update
- `src/components/dispatcher/DispatcherAlerts.tsx` -- lines 171-188

### Technical detail
```tsx
// Replace the trucks query with:
const { data: inspectionSchedules } = await supabase
  .from('service_schedules')
  .select('id, truck_id, last_performed_date, interval_days, trucks!inner(unit_number, status)')
  .eq('service_name', '120-Day Inspection')
  .eq('trucks.status', 'active')
  .not('last_performed_date', 'is', null);

inspectionSchedules?.forEach(schedule => {
  const lastPerformed = new Date(schedule.last_performed_date + 'T00:00:00');
  const nextDue = addDays(lastPerformed, schedule.interval_days);
  if (isBefore(nextDue, in14Days)) {
    const truck = schedule.trucks as any;
    alertsList.push({
      id: `insp-${schedule.truck_id}`,
      type: 'inspection',
      priority: isBefore(nextDue, now) ? 'high' : 'medium',
      title: `Inspection Due - Unit ${truck.unit_number}`,
      description: `Due ${format(nextDue, 'MMM d, yyyy')}`,
      link: '/trucks',
    });
  }
});
```

This aligns the dispatcher alerts with the same source of truth used by the Trucks page.

