import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useOperationalCPM } from '@/hooks/useOperationalCPM';

export interface MoneyLinesData {
  grossRevenue: number;
  netRevenue: number;
  prevGrossRevenue: number;
  prevNetRevenue: number;
  deliveredLoadCount: number;
  totalMiles?: number;
  prevTotalMiles?: number;
}

interface MoneyLinesProps {
  data: MoneyLinesData | undefined;
  isLoading: boolean;
  /** e.g. "this settlement week", used in the comparison line */
  periodLabel: string;
  /** Controls that scope these figures (the period picker) sit in the header. */
  controls?: React.ReactNode;
}

const usd = (v: number, cents = false) =>
  v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

function Line({ label, note, value, negative, strong, rule }: {
  label: string;
  note?: React.ReactNode;
  value: number;
  negative?: boolean;
  strong?: boolean;
  rule?: 'single' | 'double';
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-3 py-2.5',
        rule === 'single' && 'border-t',
        rule === 'double' && 'border-t-[3px] border-double border-foreground/70',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className={cn('text-[15px]', strong ? 'font-semibold' : 'text-foreground/90')}>{label}</div>
        {note && <div className="text-[13px] text-muted-foreground">{note}</div>}
      </div>
      <div
        className={cn(
          'figure shrink-0 text-right',
          strong ? 'text-2xl font-bold' : 'text-lg font-semibold',
          negative && 'text-muted-foreground',
        )}
      >
        {negative && value > 0 ? '−' : ''}
        {usd(Math.abs(value))}
      </div>
    </div>
  );
}

/**
 * The period's money as statement lines, figures flush right so they scan
 * down one edge. Operating cost is an estimate (miles × the owner's cost per
 * mile) and is labeled as one.
 */
export function MoneyLines({ data, isLoading, periodLabel, controls }: MoneyLinesProps) {
  const { costPerMile } = useOperationalCPM();

  if (isLoading || !data) {
    return (
      <section className="rounded-lg border bg-card px-4 py-3 space-y-3" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </section>
    );
  }

  const landstarShare = data.grossRevenue - data.netRevenue;
  const miles = data.totalMiles ?? 0;
  const operatingCost = miles * costPerMile;
  const profit = data.netRevenue - operatingCost;
  const margin = data.netRevenue > 0 ? (profit / data.netRevenue) * 100 : 0;

  const prevProfit = (data.prevNetRevenue ?? 0) - (data.prevTotalMiles ?? 0) * costPerMile;
  const change = prevProfit !== 0 ? ((profit - prevProfit) / Math.abs(prevProfit)) * 100 : null;

  return (
    <section aria-labelledby="money-title" className="rounded-lg border bg-card px-4 pt-3 pb-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="money-title" className="font-condensed text-xl font-bold">Money</h2>
        {controls}
      </div>
      <div className="mt-1">
        <Line
          label="Gross revenue"
          note={`${data.deliveredLoadCount} load${data.deliveredLoadCount === 1 ? '' : 's'} delivered`}
          value={data.grossRevenue}
        />
        <Line label="Landstar's share" value={landstarShare} negative />
        <Line label="Truck revenue" value={data.netRevenue} strong rule="single" />
        <Line
          label="Operating cost (est.)"
          note={
            <>
              {miles.toLocaleString()} mi at {usd(costPerMile, true)}/mi.{' '}
              <Link to="/finance?view=settings" className="underline">Change rate</Link>
            </>
          }
          value={operatingCost}
          negative
        />
        <Line label="Operating profit (est.)" value={profit} strong rule="double" />
      </div>
      <p className="border-t pt-2 pb-1 text-[13px] text-muted-foreground tabular-nums">
        {margin.toFixed(1)}% of truck revenue
        {change !== null && (
          <>
            {', '}
            <span className={cn('font-semibold', change >= 0 ? 'text-success' : 'text-destructive')}>
              {change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(0)}%
            </span>{' '}
            vs the same point last period
          </>
        )}
        {change === null && `, nothing to compare from last period yet`}
        {` (${periodLabel})`}
      </p>
    </section>
  );
}
