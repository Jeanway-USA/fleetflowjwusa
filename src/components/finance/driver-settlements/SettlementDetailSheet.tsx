import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';

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

export function SettlementDetailSheet({ settlementId, onClose, driverMap }: Props) {
  const open = !!settlementId;
  const [downloading, setDownloading] = useState(false);

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

  const earnings = (items as any[]).filter((i) => i.item_type === 'load_pay');
  const reimbursements = (items as any[]).filter((i) => i.item_type === 'reimbursement');

  const handleDownload = async () => {
    if (!settlementId) return;
    setDownloading(true);
    try {
      await generateSettlementPdf(settlementId);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center justify-between gap-3">
            <span>Settlement Statement — {driverName}</span>
            {settlement && <StatusBadge status={settlement.status} />}
          </SheetTitle>
          {settlement && (
            <SheetDescription className="flex items-center justify-between gap-3 flex-wrap">
              <span>
                Period{' '}
                {format(parseISO(`${settlement.period_start}T00:00:00`), 'MMM d')} –{' '}
                {format(parseISO(`${settlement.period_end}T00:00:00`), 'MMM d, yyyy')}
                {settlement.payment_date && (
                  <>
                    {' '}· Paid{' '}
                    {format(parseISO(`${settlement.payment_date}T00:00:00`), 'MMM d, yyyy')}
                  </>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                disabled={downloading}
              >
                <Download className="h-4 w-4 mr-2" />
                {downloading ? 'Generating…' : 'Download PDF'}
              </Button>
            </SheetDescription>
          )}
        </SheetHeader>

        {settlement && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat label="Gross Pay" value={Number(settlement.gross_pay ?? 0)} />
              <SummaryStat
                label="Reimbursements"
                value={Number(settlement.reimbursements ?? 0)}
              />
              <SummaryStat
                label="Net Pay"
                value={Number(settlement.net_pay ?? 0)}
                primary
              />
            </div>

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
                    <p className="text-muted-foreground">YTD Reimbursements</p>
                    <p className="font-semibold">
                      {formatCurrency(Number(settlement.ytd_reimbursements ?? 0))}
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
            <ItemSection title="Reimbursements" rows={reimbursements} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SummaryStat({
  label,
  value,
  primary,
}: {
  label: string;
  value: number;
  primary?: boolean;
}) {
  return (
    <div className={`rounded-md border p-3 ${primary ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold ${primary ? 'text-primary text-lg' : ''}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function ItemSection({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">None in this period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{r.description ?? '—'}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(Number(r.amount ?? 0))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
