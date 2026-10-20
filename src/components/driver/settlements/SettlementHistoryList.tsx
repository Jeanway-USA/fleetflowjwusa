import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/formatters';
import { netSettlement, type SettlementRow } from '@/hooks/useDriverSettlementsPage';
import { Chip, Note, Panel, PanelHead } from '@/components/driver/ui/driver-ui';

interface Props {
  settlements: SettlementRow[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  milesByPeriod: Record<string, number>;
}

function fmt(d: string) {
  try {
    return format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy');
  } catch {
    return d;
  }
}

const statusTone = (status: string) => (status === 'paid' ? 'good' : status === 'approved' ? 'active' : 'neutral');

/** Every pay statement, newest first. Tap one to open it above. */
export function SettlementHistoryList({ settlements, isLoading, selectedId, onSelect, milesByPeriod }: Props) {
  return (
    <Panel>
      <PanelHead title="All statements" aside={`${settlements.length} ${settlements.length === 1 ? 'statement' : 'statements'}`} />
      {isLoading ? (
        <div className="space-y-2 px-4 pb-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : settlements.length === 0 ? (
        <Note>No settlements yet. Once dispatch issues your first pay statement, it will appear here.</Note>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {settlements.map((s) => {
            const selected = s.id === selectedId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={cn('flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none', selected && 'bg-secondary')}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tabular-nums">{fmt(s.period_end)}</span>
                    <span className="block text-xs text-muted-foreground">{(milesByPeriod[s.id] ?? 0).toLocaleString()} miles, gross {formatCurrency(s.gross_pay)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn('block text-sm font-semibold tabular-nums', selected ? 'text-foreground' : 'text-success')}>{formatCurrency(netSettlement(s))}</span>
                    <Chip tone={statusTone(s.status)} className="mt-1 capitalize">{s.status}</Chip>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
