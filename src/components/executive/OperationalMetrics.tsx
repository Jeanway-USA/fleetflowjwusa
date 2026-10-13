import { Skeleton } from '@/components/ui/skeleton';

interface OperationalData {
  totalLoads: number;
  totalMiles: number;
  revenuePerMile: number;
  fleetUtilization: number;
  onTimeRate: number | null;
  totalEmptyMiles?: number;
  emptyMilesRatio?: number;
}

interface OperationalMetricsProps {
  data: OperationalData | undefined;
  isLoading: boolean;
}

function Row({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[15px]">{label}</div>
        {note && <div className="text-[13px] text-muted-foreground">{note}</div>}
      </div>
      <div className="figure shrink-0 text-lg font-semibold">{value}</div>
    </div>
  );
}

export function OperationalMetrics({ data, isLoading }: OperationalMetricsProps) {
  const number = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
  const percent = (n: number) => `${n.toFixed(1)}%`;

  return (
    <section aria-labelledby="ops-title" className="h-full rounded-lg border bg-card px-4 pt-3 pb-2">
      <h2 id="ops-title" className="font-condensed text-xl font-bold">Operations</h2>
      {isLoading ? (
        <div className="space-y-3 py-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-1 divide-y">
          <Row label="Loads delivered" value={number(data?.totalLoads ?? 0)} />
          <Row label="Loaded miles" value={`${number(data?.totalMiles ?? 0)} mi`} />
          <Row label="Truck revenue per mile" value={`$${(data?.revenuePerMile ?? 0).toFixed(2)}`} />
          <Row
            label="On-time delivery"
            note={data?.onTimeRate == null ? 'Not enough arrivals logged yet' : 'Arrived on or before the scheduled day'}
            value={data?.onTimeRate == null ? 'n/a' : percent(data.onTimeRate)}
          />
          <Row label="Empty miles" value={`${number(data?.totalEmptyMiles ?? 0)} mi`} note={`${percent(data?.emptyMilesRatio ?? 0)} of all miles`} />
          <Row label="Trucks on a load now" value={percent(data?.fleetUtilization ?? 0)} />
        </div>
      )}
    </section>
  );
}
