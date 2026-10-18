import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { fetchSettlementSnapshot } from '@/lib/pay-packages/api';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { localDateOf } from '@/lib/datetime';

/**
 * Shows the pay package a settlement was paid under, exactly as it stood that week. Settlements made before pay
 * packages existed have no snapshot, so nothing is shown for them.
 */
export function SettlementPackageNote({ settlementId }: { settlementId: string }) {
  const { data } = useQuery({
    queryKey: ['pay-packages', 'snapshot', settlementId],
    queryFn: () => fetchSettlementSnapshot(settlementId),
    retry: false,
  });
  if (!data) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <span className="font-medium">
          Paid under {data.package_name ?? 'a pay package'}
          {data.version_number != null && `, version ${data.version_number}`}
        </span>
        <span className="text-xs text-muted-foreground">frozen {formatDate(localDateOf(data.created_at))}</span>
      </div>
      <ul className="mt-2 divide-y">
        {(data.lines ?? []).map((l, i) => (
          <li key={`${l.componentId}-${i}`} className="flex items-start justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block">{l.label}</span>
              <span className="block text-xs text-muted-foreground">{l.detail}</span>
            </span>
            <span className="tabular-nums">{l.isDeduction ? '−' : ''}{formatCurrency(l.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
