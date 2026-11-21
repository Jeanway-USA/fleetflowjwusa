import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useOperationalCPM } from '@/hooks/useOperationalCPM';
import type { MoneyLinesData } from './MoneyLines';

const usd = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface WeekMoneyHeroProps {
  data: MoneyLinesData | undefined;
  isLoading: boolean;
  /** e.g. "settlement week", shown with the headline so it is clear which period the figure covers. */
  periodLabel: string;
}

/**
 * The phone's answer to "what did we make": one large figure (truck revenue, what the truck keeps after Landstar's
 * share) with the three numbers behind it underneath. It reads the same data as the Money lines, so the figures match.
 */
export function WeekMoneyHero({ data, isLoading, periodLabel }: WeekMoneyHeroProps) {
  const { costPerMile } = useOperationalCPM();

  if (isLoading || !data) {
    return (
      <section className="space-y-3 rounded-lg border bg-card p-4" aria-busy>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-10 w-full" />
      </section>
    );
  }

  const landstarShare = data.grossRevenue - data.netRevenue;
  const operatingCost = (data.totalMiles ?? 0) * costPerMile;
  const profit = data.netRevenue - operatingCost;

  return (
    <section aria-labelledby="week-money-title" className="rounded-lg border bg-card p-4">
      <h2 id="week-money-title" className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        Truck revenue, {periodLabel}
      </h2>
      <p className="figure mt-1 text-5xl font-bold leading-none tabular-nums">{usd(data.netRevenue)}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {data.deliveredLoadCount} load{data.deliveredLoadCount === 1 ? '' : 's'} delivered
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
        <Stat label="Gross" value={usd(data.grossRevenue)} />
        <Stat label="Landstar's share" value={usd(landstarShare)} muted />
        <Stat label="Profit (est.)" value={usd(profit)} negative={profit < 0} />
      </dl>
      <Link to="/finance" className="mt-2 flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
        Open Money
      </Link>
    </section>
  );
}

function Stat({ label, value, muted, negative }: { label: string; value: string; muted?: boolean; negative?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12px] text-muted-foreground">{label}</dt>
      <dd className={cn('figure text-2xl font-bold tabular-nums', muted && 'text-muted-foreground', negative && 'text-destructive')}>{value}</dd>
    </div>
  );
}
