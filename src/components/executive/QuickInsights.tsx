import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface Insight {
  id: string;
  type: 'success' | 'warning' | 'info' | 'alert';
  message: string;
}

interface QuickInsightsProps {
  insights: Insight[];
  isLoading: boolean;
}

/** Plain sentences, marked only by color when they need attention. */
export function QuickInsights({ insights, isLoading }: QuickInsightsProps) {
  return (
    <section aria-labelledby="notes-title" className="h-full rounded-lg border bg-card px-4 pt-3 pb-2">
      <h2 id="notes-title" className="font-condensed text-xl font-bold">Notes</h2>
      {isLoading ? (
        <div className="space-y-3 py-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : insights.length === 0 ? (
        <p className="py-6 text-[15px] text-muted-foreground">Nothing unusual this period.</p>
      ) : (
        <ul className="mt-1 divide-y">
          {insights.map(insight => (
            <li
              key={insight.id}
              className={cn(
                'py-2.5 text-[15px] leading-snug',
                insight.type === 'alert' && 'font-semibold text-destructive',
                insight.type === 'warning' && 'font-semibold',
                insight.type === 'success' && 'text-foreground',
                insight.type === 'info' && 'text-muted-foreground',
              )}
            >
              {insight.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
