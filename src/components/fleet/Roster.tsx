import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The list the Drivers, Trucks and Trailers pages share: ruled rows with a name, a few facts and a
 * menu, one design on a desktop and a phone. Each page decides what its facts are.
 */

export type FactTone = 'bad' | 'warn' | 'good';

export interface RosterFact {
  label: string;
  value: React.ReactNode;
  tone?: FactTone;
}

export interface RosterEntry {
  id: string;
  title: string;
  /** Shown beside the title: status, onboarding and so on. */
  chips?: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  facts: RosterFact[];
  /** The row's actions menu. */
  menu?: React.ReactNode;
  onOpen?: () => void;
}

const toneClass: Record<FactTone, string> = {
  bad: 'text-destructive',
  warn: 'text-warning',
  good: 'text-success',
};

/** A date fact that turns red when expired and amber when due within 30 days. */
export function expiryFact(label: string, date: string | null | undefined, soonDays = 30): RosterFact {
  if (!date) return { label, value: <span className="font-normal text-muted-foreground">Not set</span> };
  const parsed = parseISO(date.length === 10 ? `${date}T00:00:00` : date);
  const days = differenceInCalendarDays(parsed, new Date());
  const shown = format(parsed, 'MMM d, yyyy');
  if (days < 0) return { label, value: `${shown}, expired`, tone: 'bad' };
  if (days <= soonDays) return { label, value: `${shown}, in ${days} ${days === 1 ? 'day' : 'days'}`, tone: 'warn' };
  return { label, value: shown };
}

export function Roster({ entries, selectedIds, onToggle, empty, bordered = true }: {
  entries: RosterEntry[];
  /** Turn off the outer box when the roster sits inside a panel. */
  bordered?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  empty?: React.ReactNode;
}) {
  if (entries.length === 0) {
    return <div className={cn('px-4 py-10 text-center text-sm text-muted-foreground', bordered ? 'rounded-lg border bg-card' : 'border-t')}>{empty}</div>;
  }
  return (
    <ul className={cn('divide-y', bordered ? 'rounded-lg border bg-card' : 'border-t')}>
      {entries.map((entry) => {
        const selected = selectedIds?.has(entry.id) ?? false;
        return (
          <li
            key={entry.id}
            data-row-id={entry.id}
            className={cn('flex items-start gap-3 px-4 py-3 transition-colors', selected && 'bg-primary/5')}
          >
            {onToggle && (
              <div className="-ml-2.5 -mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center">
                <Checkbox checked={selected} onCheckedChange={() => onToggle(entry.id)} aria-label={`Select ${entry.title}`} />
              </div>
            )}
            {entry.leading}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {entry.onOpen ? (
                  <button type="button" onClick={entry.onOpen} className="min-h-8 text-left font-condensed text-xl font-bold leading-tight hover:underline">
                    {entry.title}
                  </button>
                ) : (
                  <span className="font-condensed text-xl font-bold leading-tight">{entry.title}</span>
                )}
                {entry.chips}
              </div>
              {entry.subtitle && <div className="text-[13px] text-muted-foreground">{entry.subtitle}</div>}
              {entry.facts.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  {entry.facts.map((fact) => (
                    <div key={fact.label} className="min-w-0">
                      <dt className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{fact.label}</dt>
                      <dd className={cn('text-[15px] font-medium', fact.tone && toneClass[fact.tone])}>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {entry.menu && <div className="-mr-2 shrink-0">{entry.menu}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function RosterToolbar({ search, onSearch, placeholder, children }: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-11 pl-10 pr-11 sm:pl-10 sm:pr-11"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function RosterBulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" className="h-11" onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}

/** Saves rows as a CSV file, quoting every cell. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
