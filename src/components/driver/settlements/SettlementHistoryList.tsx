import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/formatters';
import { netSettlement, type SettlementRow } from '@/hooks/useDriverSettlementsPage';

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

function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'paid') return 'default';
  if (status === 'approved') return 'secondary';
  return 'outline';
}

export function SettlementHistoryList({
  settlements,
  isLoading,
  selectedId,
  onSelect,
  milesByPeriod,
}: Props) {
  return (
    <Card className="card-elevated h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Settlement History
          </p>
          <p className="text-sm font-medium text-foreground mt-0.5">
            {settlements.length} {settlements.length === 1 ? 'statement' : 'statements'}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {isLoading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {!isLoading && settlements.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No settlements yet. Once dispatch issues your first pay statement, it will
              appear here.
            </div>
          )}

          {!isLoading &&
            settlements.map((s) => {
              const isSelected = s.id === selectedId;
              const net = netSettlement(s);
              const miles = milesByPeriod[s.id] ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40',
                    isSelected &&
                      'bg-primary/10 border-l-2 border-primary -ml-[1px]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {fmt(s.period_end)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {fmt(s.period_start)} – {fmt(s.period_end)}
                      </p>
                    </div>
                    <Badge
                      variant={statusVariant(s.status)}
                      className="text-[10px] capitalize shrink-0"
                    >
                      {s.status}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Miles</p>
                      <p className="font-semibold text-foreground tabular-nums">
                        {miles.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Gross</p>
                      <p className="font-semibold text-foreground tabular-nums">
                        {formatCurrency(s.gross_pay)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Net</p>
                      <p
                        className={cn(
                          'font-semibold tabular-nums',
                          isSelected ? 'text-primary' : 'text-success',
                        )}
                      >
                        {formatCurrency(net)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </ScrollArea>
    </Card>
  );
}
