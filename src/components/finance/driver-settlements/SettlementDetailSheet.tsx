import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Props {
  settlementId: string | null;
  onClose: () => void;
  driverMap: Map<string, Driver>;
}

const ITEM_LABEL: Record<string, string> = {
  load_pay: 'Load Pay',
  bonus: 'Bonus',
  deduction: 'Deduction',
  advance: 'Advance',
  reimbursement: 'Reimbursement',
  adjustment: 'Adjustment',
  other: 'Other',
};

export function SettlementDetailSheet({ settlementId, onClose, driverMap }: Props) {
  const open = !!settlementId;

  const { data: settlement } = useQuery({
    queryKey: ['driver_settlement', settlementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlements')
        .select('*')
        .eq('id', settlementId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: open,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['driver_settlement_items', settlementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlement_items')
        .select('*')
        .eq('settlement_id', settlementId!)
        .order('item_type', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const driver = settlement ? driverMap.get(settlement.driver_id) : null;
  const driverName = driver
    ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() || 'Driver'
    : 'Driver';

  const earnings = (items as any[]).filter((i) =>
    ['load_pay', 'bonus', 'reimbursement', 'adjustment'].includes(i.item_type),
  );
  const reductions = (items as any[]).filter((i) =>
    ['deduction', 'advance'].includes(i.item_type),
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center justify-between gap-3">
            <span>Settlement Statement — {driverName}</span>
            {settlement && <StatusBadge status={settlement.status} />}
          </SheetTitle>
          {settlement && (
            <SheetDescription>
              Period{' '}
              {format(parseISO(`${settlement.period_start}T00:00:00`), 'MMM d')} –{' '}
              {format(parseISO(`${settlement.period_end}T00:00:00`), 'MMM d, yyyy')}
              {settlement.payment_date && (
                <>
                  {' '}· Paid{' '}
                  {format(parseISO(`${settlement.payment_date}T00:00:00`), 'MMM d, yyyy')}
                </>
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        {settlement && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryStat label="Gross" value={Number(settlement.gross_pay ?? 0)} />
              <SummaryStat
                label="Reimbursements"
                value={Number(settlement.reimbursements ?? 0)}
              />
              <SummaryStat
                label="Fuel / Advances"
                value={Number(settlement.fuel_advances ?? 0)}
                negative
              />
              <SummaryStat
                label="Deductions"
                value={Number(settlement.deductions ?? 0)}
                negative
              />
            </div>

            <Card className="border-primary/40">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm text-muted-foreground">Net Pay</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(Number(settlement.net_pay ?? 0))}
                  </p>
                </div>
                <Badge variant="secondary">{settlement.status}</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Year-to-Date (Proof of Income)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">YTD Gross</p>
                    <p className="font-semibold">
                      {formatCurrency(Number(settlement.ytd_gross ?? 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">YTD Deductions</p>
                    <p className="font-semibold text-destructive">
                      {formatCurrency(Number(settlement.ytd_deductions ?? 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">YTD Net</p>
                    <p className="font-semibold text-primary">
                      {formatCurrency(Number(settlement.ytd_net ?? 0))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ItemSection title="Earnings" rows={earnings} />
            <ItemSection title="Deductions & Advances" rows={reductions} negative />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SummaryStat({
  label,
  value,
  negative,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold ${negative ? 'text-destructive' : ''}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function ItemSection({
  title,
  rows,
  negative,
}: {
  title: string;
  rows: any[];
  negative?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Badge variant="outline">{ITEM_LABEL[r.item_type] ?? r.item_type}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.description ?? '—'}</TableCell>
              <TableCell
                className={`text-right font-medium ${negative ? 'text-destructive' : ''}`}
              >
                {negative ? '−' : ''}
                {formatCurrency(Number(r.amount ?? 0))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
