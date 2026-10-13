import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatCell {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Red pen: the figure needs attention. */
  problem?: boolean;
}

/**
 * A row of headline figures inside one ruled box, instead of a grid of tiles.
 * Two columns on phones when there are four cells, one row from md up.
 */
export function StatStrip({ cells, isLoading, className }: { cells: StatCell[]; isLoading?: boolean; className?: string }) {
  const four = cells.length === 4;
  return (
    <dl
      className={cn(
        'grid rounded-lg border bg-card',
        four ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3',
        '[&>div]:border-border',
        four
          ? '[&>div:nth-child(odd)]:border-r [&>div:nth-child(-n+2)]:border-b md:[&>div]:border-b-0 md:[&>div:not(:last-child)]:border-r'
          : '[&>div:not(:last-child)]:border-r',
        className,
      )}
    >
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 px-3 py-2 md:px-5 md:py-3">
          <dt className={cn('text-[13px]', cell.problem ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{cell.label}</dt>
          <dd className={cn('figure truncate text-xl font-bold leading-tight md:text-2xl', cell.problem && 'text-destructive')}>
            {isLoading ? <Skeleton className="my-0.5 h-6 w-16" /> : cell.value}
          </dd>
          {cell.note !== undefined && (
            <dd className={cn('truncate text-xs tabular-nums', cell.problem ? 'text-destructive' : 'text-muted-foreground')}>
              {isLoading ? ' ' : cell.note}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
