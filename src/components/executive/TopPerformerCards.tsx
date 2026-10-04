import { Skeleton } from '@/components/ui/skeleton';

interface TopDriver {
  id: string;
  name: string;
  avatarUrl?: string;
  revenue: number;
  miles: number;
  loads: number;
}

interface TopTruck {
  id: string;
  unitNumber: string;
  revenue: number;
  miles: number;
  loads: number;
  status: string;
}

interface TopPerformerCardsProps {
  topDriver: TopDriver | undefined;
  topTruck: TopTruck | undefined;
  isLoading: boolean;
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = (n: number) => Math.round(n).toLocaleString('en-US');

function Leader({ role, name, revenue, miles, loads }: { role: string; name: string; revenue: number; miles: number; loads: number }) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">{role}</div>
          <div className="truncate text-[15px] font-semibold">{name}</div>
        </div>
        <div className="figure shrink-0 text-lg font-semibold">{usd(revenue)}</div>
      </div>
      <div className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
        {loads} load{loads === 1 ? '' : 's'}, {num(miles)} mi
      </div>
    </div>
  );
}

/** Who and what earned the most gross this period. */
export function TopPerformerCards({ topDriver, topTruck, isLoading }: TopPerformerCardsProps) {
  return (
    <section aria-labelledby="leaders-title" className="h-full rounded-lg border bg-card px-4 pt-3 pb-2">
      <h2 id="leaders-title" className="font-condensed text-xl font-bold">Top earners</h2>
      {isLoading ? (
        <div className="space-y-3 py-3">
          {[0, 1].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !topDriver && !topTruck ? (
        <p className="py-6 text-[15px] text-muted-foreground">No delivered loads this period.</p>
      ) : (
        <div className="mt-1 divide-y">
          {topDriver && <Leader role="Driver" name={topDriver.name} revenue={topDriver.revenue} miles={topDriver.miles} loads={topDriver.loads} />}
          {topTruck && <Leader role="Truck" name={`Unit ${topTruck.unitNumber}`} revenue={topTruck.revenue} miles={topTruck.miles} loads={topTruck.loads} />}
        </div>
      )}
    </section>
  );
}
