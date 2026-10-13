import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface PendingAction {
  id: string;
  type: 'document' | 'maintenance' | 'defect' | 'credential' | 'settlement';
  title: string;
  count: number;
  priority: 'high' | 'medium' | 'low';
  link?: string;
}

interface PendingActionsCardProps {
  actions: PendingAction[];
  isLoading?: boolean;
}

const typeLabel: Record<PendingAction['type'], string> = {
  document: 'Documents',
  maintenance: 'Maintenance',
  defect: 'Defects',
  credential: 'Credentials',
  settlement: 'Money',
};

export function PendingActionsCard({ actions, isLoading }: PendingActionsCardProps) {
  const high = actions.filter(a => a.priority === 'high').length;

  return (
    <section aria-labelledby="todo-title" className="h-full rounded-lg border bg-card px-4 pt-3 pb-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="todo-title" className="font-condensed text-xl font-bold">To do</h2>
        {!isLoading && actions.length > 0 && (
          <span className={cn('text-sm', high > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
            {high > 0 ? `${high} urgent` : `${actions.length} open`}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3 py-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : actions.length === 0 ? (
        <p className="py-6 text-[15px] text-muted-foreground">Nothing waiting on you.</p>
      ) : (
        <ul className="mt-1 divide-y">
          {actions.map(action => {
            const row = (
              <div className="flex min-h-[48px] items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[15px] font-medium', action.priority === 'high' && 'text-destructive')}>{action.title}</p>
                  <p className="text-[13px] text-muted-foreground">{typeLabel[action.type]}</p>
                </div>
                <span className={cn('figure text-lg font-semibold', action.priority === 'high' && 'text-destructive')}>
                  {action.count}
                </span>
                {action.link && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
            return (
              <li key={action.id}>
                {action.link ? <Link to={action.link} className="block hover:bg-secondary/60 -mx-4 px-4">{row}</Link> : row}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
