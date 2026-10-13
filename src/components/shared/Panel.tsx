import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface PanelProps {
  title: string;
  /** Short figure or status beside the title, e.g. "3 open". */
  aside?: React.ReactNode;
  /** Red pen on the aside when something needs attention. */
  asideProblem?: boolean;
  link?: { to: string; label: string };
  isLoading?: boolean;
  /** One line shown instead of the body when there is nothing to list. */
  empty?: React.ReactNode;
  isEmpty?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/** A titled section with a condensed heading, plain rows, and a one-line empty state. */
export function Panel({ title, aside, asideProblem, link, isLoading, empty, isEmpty, className, children }: PanelProps) {
  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      <header className="flex items-baseline gap-2 px-4 pt-3 pb-1">
        <h2 className="font-condensed text-xl font-bold leading-tight">{title}</h2>
        {aside !== undefined && !isLoading && (
          <span className={cn('text-sm tabular-nums', asideProblem ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{aside}</span>
        )}
        {link && (
          <Link to={link.to} className="ml-auto inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary">
            {link.label} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      {isLoading ? (
        <div className="space-y-3 px-4 pt-2 pb-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : isEmpty ? (
        <p className="px-4 pt-1 pb-4 text-[15px] text-muted-foreground">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}
