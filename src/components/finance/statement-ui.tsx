import { cn } from '@/lib/utils';

/**
 * The two pieces the Money tabs share: a titled panel, and a statement line (label and note on the left,
 * figure on the right, optionally ruled). Keeping them in one place keeps every tab drawn the same way.
 */

export function Panel({ title, description, aside, children, className, id, flush }: {
  title: string;
  description?: React.ReactNode;
  /** Controls that sit beside the title: usually the section's main action. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Let the content run edge to edge, as tables and lists do. */
  flush?: boolean;
}) {
  const headingId = id ?? `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className={cn('rounded-lg border bg-card', className)}>
      <header className="flex flex-col gap-3 px-4 pt-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 id={headingId} className="font-condensed text-xl font-bold leading-tight">{title}</h3>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </header>
      <div className={cn(!flush && 'px-4 pb-2')}>{children}</div>
    </section>
  );
}

export function StatementLine({ label, note, value, strong, rule, muted, tone }: {
  label: React.ReactNode;
  note?: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  rule?: 'single' | 'double';
  muted?: boolean;
  tone?: 'good' | 'bad';
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
        <div className={cn('text-[15px]', strong && 'font-semibold')}>{label}</div>
        {note && <div className="text-[13px] text-muted-foreground">{note}</div>}
      </div>
      <div
        className={cn(
          'figure shrink-0 text-right',
          strong ? 'text-2xl font-bold' : 'text-lg font-semibold',
          muted && 'text-muted-foreground',
          tone === 'good' && 'text-success',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </div>
    </div>
  );
}
