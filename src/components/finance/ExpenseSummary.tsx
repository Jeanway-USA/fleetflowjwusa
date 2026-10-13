import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';

type Expense = Database['public']['Tables']['expenses']['Row'];

interface TypeTotals {
  total: number;
  byType: Record<string, number>;
  gallonsByType: Record<string, number>;
}

interface ExpenseSummaryProps {
  standalone: TypeTotals;
  loadLinked: TypeTotals;
  /** Costs recorded the older way, on the load itself. */
  legacyOperating: number;
  truckPayments: number;
  credits: Expense[];
  creditsTotal: number;
  advances: Expense[];
  advancesTotal: number;
  /** Costs after credits: what the P&L subtracts. */
  netCosts: number;
}

const money = (v: number) => formatCurrency(v);

function Line({ label, note, value, strong, rule, muted, positive }: {
  label: React.ReactNode;
  note?: React.ReactNode;
  value: string;
  strong?: boolean;
  rule?: 'single' | 'double';
  muted?: boolean;
  positive?: boolean;
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
      <div className={cn('figure shrink-0 text-right', strong ? 'text-2xl font-bold' : 'text-lg font-semibold', muted && 'text-muted-foreground', positive && 'text-success')}>
        {value}
      </div>
    </div>
  );
}

function RowList({ rows, sign }: { rows: Expense[]; sign: '+' | '' }) {
  return (
    <ul className="divide-y border-t">
      {rows.map((e) => (
        <li key={e.id} className="flex items-baseline gap-3 py-2 text-[14px]">
          <div className="min-w-0 flex-1">
            <div className="truncate">{e.description || e.expense_type}</div>
            <div className="text-[13px] text-muted-foreground">
              {e.expense_date ? format(parseISO(e.expense_date), 'MMM d') : 'No date'}, {e.expense_type}
            </div>
          </div>
          <div className="figure shrink-0 font-semibold">{sign}{money(Math.abs(Number(e.amount)))}</div>
        </li>
      ))}
    </ul>
  );
}

export function ExpenseSummary({
  standalone, loadLinked, legacyOperating, truckPayments, credits, creditsTotal, advances, advancesTotal, netCosts,
}: ExpenseSummaryProps) {
  // One list by category. Whether a cost was tied to a load is bookkeeping, shown as a note.
  const types = [...new Set([...Object.keys(standalone.byType), ...Object.keys(loadLinked.byType)])].sort();
  const lines = types
    .map((type) => {
      const own = standalone.byType[type] || 0;
      const onLoads = loadLinked.byType[type] || 0;
      const gallons = (standalone.gallonsByType[type] || 0) + (loadLinked.gallonsByType[type] || 0);
      return { type, amount: own + onLoads, onLoads, gallons };
    })
    .filter((l) => l.amount !== 0);

  const grossCosts = standalone.total + loadLinked.total + legacyOperating + truckPayments;
  const hasAnything = lines.length > 0 || truckPayments > 0 || legacyOperating > 0 || creditsTotal > 0 || advancesTotal > 0;

  if (!hasAnything) {
    return (
      <section aria-label="Costs for the selected period" className="mb-5 rounded-lg border bg-card px-4 py-4 md:max-w-2xl">
        <p className="text-[15px] font-medium">No costs recorded for this period.</p>
        <p className="mt-1 text-sm text-muted-foreground">Upload a Landstar statement or add an expense to see them here.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="costs-title" className="mb-5 rounded-lg border bg-card px-4 pt-3 pb-2 md:max-w-2xl">
      <h3 id="costs-title" className="font-condensed text-xl font-bold leading-tight">Costs by category</h3>
      <p className="pb-1 text-[13px] text-muted-foreground">Everything below adds up to the net costs the Profit &amp; loss tab subtracts.</p>

      {lines.map((l) => (
        <Line
          key={l.type}
          label={l.type}
          note={
            [
              l.gallons > 0 ? `${l.gallons.toLocaleString('en-US', { maximumFractionDigits: 1 })} gallons` : '',
              l.onLoads > 0 && l.onLoads !== l.amount ? `${money(l.onLoads)} tied to loads` : l.onLoads > 0 ? 'Tied to loads' : '',
            ].filter(Boolean).join(', ') || undefined
          }
          value={money(l.amount)}
        />
      ))}
      {legacyOperating > 0 && <Line label="Operating, older load entries" value={money(legacyOperating)} />}
      {truckPayments > 0 && <Line label="Truck payments" note="From the loan ledger on the Trucks page" value={money(truckPayments)} />}
      <Line label="Costs before credits" value={money(grossCosts)} strong rule="single" />
      {creditsTotal > 0 && <Line label="Credits and reimbursements" note="Fuel discounts and money returned" value={`−${money(creditsTotal)}`} positive />}
      <Line label="Net costs" strong rule="double" value={money(netCosts)} />

      {(credits.length > 0 || advances.length > 0) && (
        <div className="border-t">
          {credits.length > 0 && (
            <details className="border-b last:border-b-0">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[15px]">
                <span>Credits and reimbursements ({credits.length})</span>
                <span className="figure font-semibold text-success">+{money(creditsTotal)}</span>
              </summary>
              <RowList rows={credits} sign="+" />
            </details>
          )}
          {advances.length > 0 && (
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[15px]">
                <span>Card advances, not costs ({advances.length})</span>
                <span className="figure font-semibold text-muted-foreground">{money(advancesTotal)}</span>
              </summary>
              <RowList rows={advances} sign="" />
            </details>
          )}
        </div>
      )}
    </section>
  );
}
