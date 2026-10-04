import { StatStrip } from '@/components/shared/StatStrip';
import {
  useFleetAvailability,
  useMaintenanceCostMTD,
  useCostPerMile,
  useComplianceAlerts,
} from '@/hooks/useMaintenanceData';

/** Shop figures as one ruled strip; inspection problems listed in red pen below it. */
export function MaintenanceKPICards() {
  const fleet = useFleetAvailability();
  const cost = useMaintenanceCostMTD();
  const cpm = useCostPerMile();
  const compliance = useComplianceAlerts();

  const alerts = compliance.data?.count || 0;
  const trucks = compliance.data?.trucks ?? [];

  return (
    <div className="space-y-2">
      <StatStrip
        isLoading={fleet.isLoading || cost.isLoading || cpm.isLoading || compliance.isLoading}
        cells={[
          {
            label: 'Trucks ready',
            value: `${fleet.data?.available || 0} of ${fleet.data?.total || 0}`,
            note: `${fleet.data?.inShop || 0} in the shop`,
            problem: (fleet.data?.inShop || 0) > 0,
          },
          {
            label: 'Shop cost this month',
            value: `$${(cost.data || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            note: 'Month to date',
          },
          {
            label: 'Maintenance per mile',
            value: `$${(cpm.data || 0).toFixed(3)}`,
            note: 'Shop cost / miles driven',
          },
          {
            label: '120-day inspections',
            value: alerts,
            note: alerts > 0 ? 'Due soon or overdue' : 'All up to date',
            problem: alerts > 0,
          },
        ]}
      />
      {alerts > 0 && trucks.length > 0 && (
        <p className="px-1 text-sm font-semibold text-destructive tabular-nums">
          {trucks
            .map((t) =>
              `Unit ${t.unitNumber}: ${
                t.neverInspected
                  ? 'never inspected'
                  : t.daysRemaining !== null && t.daysRemaining < 0
                    ? `overdue ${Math.abs(t.daysRemaining)}d`
                    : `${t.daysRemaining}d left`
              }`,
            )
            .join(', ')}
        </p>
      )}
    </div>
  );
}
