import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ListSkeletonProps {
  variant?: 'cards' | 'table' | 'rows';
  count?: number;
  className?: string;
}

/**
 * Standardized loading placeholders for list pages.
 * - `cards`: driver/truck-style card grid
 * - `table`: header + data rows
 * - `rows`: simple stacked rows (dashboards, sheets)
 */
export function ListSkeleton({ variant = 'cards', count = 6, className }: ListSkeletonProps) {
  if (variant === 'cards') {
    return (
      <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-2 pt-2 border-t border-border">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
        <div className="border-b border-border bg-muted/50 px-4 py-3 flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border last:border-b-0 flex gap-4">
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}
