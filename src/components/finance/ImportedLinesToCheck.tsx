import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import { classifyStatementLine } from '@/lib/expense-classifier';
import { Panel } from '@/components/finance/statement-ui';

interface CheckedExpense {
  id: string;
  expense_type: string;
  description?: string | null;
  amount?: number | string | null;
}

interface ImportedLinesToCheckProps {
  expenses: CheckedExpense[];
  /** Rows already ticked in the expense table. */
  selectedIds: Set<string>;
  /** Tick rows in the expense table; archiving stays a deliberate step there. */
  onSelect: (ids: string[]) => void;
}

interface Bucket {
  ids: string[];
  total: number;
}

const sum = (rows: CheckedExpense[]) => rows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);

/**
 * Lines that came in from Landstar's files filed under Misc but are not operating costs, or are real costs
 * with no category. Nothing changes until a button is pressed: not-costs are only ticked in the table below,
 * and retyping can be undone from the message that follows.
 */
export function ImportedLinesToCheck({ expenses, selectedIds, onSelect }: ImportedLinesToCheckProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const found = useMemo(() => {
    const notCosts: CheckedExpense[] = [];
    const advances: CheckedExpense[] = [];
    const costs = new Map<string, CheckedExpense[]>();
    const unknown: CheckedExpense[] = [];
    for (const e of expenses) {
      if (e.expense_type !== 'Misc') continue;
      const verdict = classifyStatementLine(e.description);
      if (!verdict) unknown.push(e);
      else if (verdict.action === 'skip') notCosts.push(e);
      else if (verdict.group === 'advance') advances.push(e);
      else costs.set(verdict.toType, [...(costs.get(verdict.toType) ?? []), e]);
    }
    return { notCosts, advances, costs, unknown };
  }, [expenses]);

  const bucket = (rows: CheckedExpense[]): Bucket => ({ ids: rows.map((r) => r.id), total: sum(rows) });
  const notCosts = bucket(found.notCosts);
  const advances = bucket(found.advances);
  const costRows = [...found.costs.values()].flat();
  const costTotal = sum(costRows);

  if (found.notCosts.length === 0 && found.advances.length === 0 && costRows.length === 0) return null;

  const retype = async (groups: Array<{ type: string; ids: string[] }>, label: string) => {
    setBusy(true);
    try {
      for (const g of groups) {
        const { error } = await supabase.from('expenses').update({ expense_type: g.type }).in('id', g.ids);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      const allIds = groups.flatMap((g) => g.ids);
      toast.success(`${label}: changed ${allIds.length} ${allIds.length === 1 ? 'line' : 'lines'}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            const { error } = await supabase.from('expenses').update({ expense_type: 'Misc' }).in('id', allIds);
            if (error) toast.error(error.message);
            else queryClient.invalidateQueries({ queryKey: ['expenses'] });
          },
        },
      });
    } catch (err: any) {
      toast.error(`Could not change the lines: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const notCostsTicked = notCosts.ids.length > 0 && notCosts.ids.every((id) => selectedIds.has(id));

  return (
    <Panel
      title="Imported lines to check"
      description="These came in from Landstar's files under Misc, which counts every one of them as a cost."
      className="mb-5"
    >
      <ul className="divide-y border-t">
        {notCosts.ids.length > 0 && (
          <li className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Not costs: {notCosts.ids.length} lines, {formatCurrency(notCosts.total)}</p>
                <p className="text-[13px] text-muted-foreground">
                  Revenue lines that Landstar reversed and reissued when a freight bill was revised (fuel surcharge, detention, stop-offs, updated bills), and statement totals. Your loads already carry the settled amounts, so counting these lowers your profit twice.
                </p>
              </div>
              <Button variant="outline" className="h-11 shrink-0" disabled={notCostsTicked} onClick={() => onSelect(notCosts.ids)}>
                {notCostsTicked ? 'Ticked below' : `Tick ${notCosts.ids.length}`}
              </Button>
            </div>
          </li>
        )}
        {advances.ids.length > 0 && (
          <li className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Advances filed as Misc: {advances.ids.length} lines, {formatCurrency(advances.total)}</p>
                <p className="text-[13px] text-muted-foreground">Early access to your money (Comchek and card advances, partial final settlements). They are not costs.</p>
              </div>
              <Button variant="outline" className="h-11 shrink-0" disabled={busy} onClick={() => retype([{ type: 'Advance', ids: advances.ids }], 'Advances')}>
                Change to Advance
              </Button>
            </div>
          </li>
        )}
        {costRows.length > 0 && (
          <li className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Real costs with no category: {costRows.length} lines, {formatCurrency(costTotal)}</p>
                <p className="text-[13px] text-muted-foreground">
                  {[...found.costs.entries()].map(([type, rows]) => `${type} ${formatCurrency(sum(rows))}`).join(', ')}. They stay costs; they only get a category.
                </p>
              </div>
              <Button
                variant="outline"
                className="h-11 shrink-0"
                disabled={busy}
                onClick={() => retype([...found.costs.entries()].map(([type, rows]) => ({ type, ids: rows.map((r) => r.id) })), 'Categories')}
              >
                Give them categories
              </Button>
            </div>
          </li>
        )}
      </ul>
      {found.unknown.length > 0 && (
        <p className="border-t py-3 text-[13px] text-muted-foreground">
          {found.unknown.length} other {found.unknown.length === 1 ? 'line' : 'lines'} ({formatCurrency(sum(found.unknown))}) stay under Misc because they could not be recognized. Open the Misc filter in the table below to check them.
        </p>
      )}
    </Panel>
  );
}
