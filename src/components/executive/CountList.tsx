import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface CountItem {
  label: string;
  value: number;
  /** Counts that need attention render in red pen when above zero. */
  problem?: boolean;
}

interface CountListProps {
  title: string;
  total: string;
  items: CountItem[];
  footer?: { label: string; value: string };
  isLoading?: boolean;
}

/** A titled block of status counts, figures flush right in two columns. */
export function CountList({ title, total, items, footer, isLoading }: CountListProps) {
  return (
    <section className="h-full rounded-lg border bg-card px-4 pt-3 pb-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-condensed text-xl font-bold">{title}</h2>
        {!isLoading && <span className="text-sm text-muted-foreground">{total}</span>}
      </div>
      {isLoading ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-6">
          {items.map((item) => {
            const flagged = item.problem && item.value > 0;
            return (
              <div key={item.label} className="flex items-baseline justify-between gap-2 border-b py-2">
                <dt className={cn('text-[15px]', flagged ? 'font-semibold text-destructive' : 'text-foreground/90')}>{item.label}</dt>
                <dd className={cn('figure text-lg font-semibold', flagged && 'text-destructive')}>{item.value}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {!isLoading && footer && (
        <div className="mt-2 flex items-baseline justify-between text-[15px]">
          <span className="text-muted-foreground">{footer.label}</span>
          <span className="figure text-lg font-semibold">{footer.value}</span>
        </div>
      )}
    </section>
  );
}
