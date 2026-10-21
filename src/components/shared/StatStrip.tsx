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
 * Any number of cells: the hairlines are the gap between them, so they wrap cleanly.
 */
export function StatStrip({ cells, isLoading, className }: { cells: StatCell[]; isLoading?: boolean; className?: string }) {
  const n = cells.length;
  return (
    <dl
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border bg-border',
        n === 2 ? 'grid-cols-2' : n === 3 ? 'grid-cols-3' : n === 4 ? 'grid-cols-2 md:grid-cols-4' : n === 5 ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
        className,
      )}
    >
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 bg-card px-3 py-2 md:px-5 md:py-3">
          <dt className={cn('text-[13px]', cell.problem ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{cell.label}</dt>
          <dd className={cn('figure truncate text-xl font-bold leading-tight md:text-2xl', cell.problem && 'text-destructive')}>
            {isLoading ? <Skeleton className="my-0.5 h-6 w-16" /> : cell.value}
          </dd>
          {cell.note !== undefined && (
            <dd className={cn('truncate text-xs tabular-nums', cell.problem ? 'text-destructive' : 'text-muted-foreground')}>
              {isLoading ? ' ' : cell.note}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
