import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { expenseCost } from '@/lib/pl-metrics';
import { findPossibleDuplicates, type DuplicateCheckExpense, type DuplicateGroup } from '@/lib/duplicate-check';

interface PossibleDuplicatesProps {
  expenses: Array<DuplicateCheckExpense & { notes?: string | null }>;
  loads: Array<{ id: string; landstar_load_id: string | null }>;
  /** Rows already ticked in the expense table. */
  selectedIds: Set<string>;
  /** Tick rows in the expense table; deleting stays a deliberate step there. */
  onSelect: (ids: string[]) => void;
}

const DISMISSED_KEY = 'fleetflow.dismissed-duplicate-groups';

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(keys: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...keys]));
  } catch {
    /* private window or blocked storage: the choice just lasts until reload */
  }
}

export function PossibleDuplicates({ expenses, loads, selectedIds, onSelect }: PossibleDuplicatesProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  const groups = useMemo(() => {
    const trip = new Map(loads.map((l) => [l.id, l.landstar_load_id]));
    return findPossibleDuplicates(expenses, { tripOf: (id) => trip.get(id) });
  }, [expenses, loads]);

  const byId = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);
  const visible = groups.filter((g) => !dismissed.has(g.key));
  const suggested = visible.flatMap((g) => g.suggestRemove);
  const costOf = (ids: string[]) => ids.reduce((s, id) => s + expenseCost(byId.get(id) ?? { amount: 0 }), 0);
  const profitEffect = costOf(suggested);
  const notTicked = suggested.filter((id) => !selectedIds.has(id));

  const dismiss = (key: string) => {
    const next = new Set(dismissed).add(key);
    setDismissed(next);
    writeDismissed(next);
  };
  const restoreDismissed = () => {
    setDismissed(new Set());
    writeDismissed(new Set());
  };

  if (visible.length === 0) {
    return (
      <p className="mb-4 text-[13px] text-muted-foreground" role="status">
        Duplicate check: nothing found.
        {dismissed.size > 0 && (
          <>
            {' '}
            <button type="button" className="underline" onClick={restoreDismissed}>Show the {dismissed.size} you marked as fine</button>
          </>
        )}
      </p>
    );
  }

  return (
    <section aria-labelledby="dup-title" className="mb-5 rounded-lg border border-primary/40 bg-primary/5">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 id="dup-title" className="font-condensed text-lg font-bold leading-tight">Possible duplicates</h3>
          <p className="text-[13px] text-muted-foreground">
            {visible.length} {visible.length === 1 ? 'charge looks' : 'charges look'} like {visible.length === 1 ? 'it was' : 'they were'} filed twice, {suggested.length} rows to review.
            {profitEffect > 0.005
              ? ` Removing them would lower costs by ${formatCurrency(profitEffect)}.`
              : ' Removing them would not change profit, because card advances are not costs.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" className="h-11" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Review'}
          </Button>
          <Button className="h-11" disabled={notTicked.length === 0} onClick={() => onSelect(suggested)}>
            {notTicked.length === 0 ? 'All ticked below' : `Tick ${notTicked.length} suggested`}
          </Button>
        </div>
      </div>

      {open && (
        <ul className="divide-y border-t">
          {visible.map((g) => {
            const remove = new Set(g.suggestRemove);
            const allTicked = g.suggestRemove.every((id) => selectedIds.has(id));
            return (
              <li key={g.key} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{g.title}</p>
                    <p className="text-[13px] text-muted-foreground">{g.reason}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" className="h-11" disabled={allTicked} onClick={() => onSelect(g.suggestRemove)}>
                      {allTicked ? 'Ticked' : `Tick ${g.suggestRemove.length}`}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-11" onClick={() => dismiss(g.key)}>
                      Not a duplicate
                    </Button>
                  </div>
                </div>
                <ul className="mt-2 divide-y rounded-md border bg-card text-[14px]">
                  {g.rows.map((r) => (
                    <li key={r.id} className={cn('flex items-baseline gap-3 px-3 py-2', remove.has(r.id) && 'bg-destructive/5')}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{r.description || r.expense_type}</div>
                        <div className="text-[13px] text-muted-foreground">
                          {format(new Date(`${r.expense_date}T00:00:00`), 'MMM d')}, {r.expense_type}
                          {r.created_at && <>, added {format(new Date(r.created_at), 'MMM d, h:mm a')}</>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="figure text-base font-semibold">{formatCurrency(Math.abs(r.amount))}</div>
                        <div className={cn('text-[13px]', remove.has(r.id) ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                          {remove.has(r.id) ? 'Suggested to remove' : 'Keep'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
