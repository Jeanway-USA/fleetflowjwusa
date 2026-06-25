import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';
import { Download, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';
import { fetchPayBreakdown, type PayBreakdown } from '@/lib/settlement-pay-breakdown';


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

  const { data: driverProfile } = useQuery({
    queryKey: ['driver_for_settlement', settlement?.driver_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('pay_type, pay_rate')
        .eq('id', settlement!.driver_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!settlement?.driver_id,
  });

  const { data: breakdown } = useQuery({
    queryKey: ['settlement_breakdown', settlementId, driverProfile?.pay_type],
    queryFn: () => fetchPayBreakdown(settlement, driverProfile ?? null),
    enabled: !!settlement && !!driverProfile,
  });

  const driver = settlement ? driverMap.get(settlement.driver_id) : null;
  const driverName = driver
    ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() || 'Driver'
    : 'Driver';

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
            <ReimbursementSection
              rows={reimbursements}
              settlementId={settlement.id}
              orgId={settlement.org_id}
              editable={settlement.status === 'draft'}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReimbursementSection({
  rows,
  settlementId,
  orgId,
  editable,
}: {
  rows: any[];
  settlementId: string;
  orgId: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['driver_settlement_items', settlementId] });
    qc.invalidateQueries({ queryKey: ['driver_settlement', settlementId] });
    qc.invalidateQueries({ queryKey: ['driver_settlements'] });
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!description.trim()) throw new Error('Description required');
      if (!Number.isFinite(amt) || amt === 0) throw new Error('Enter a non-zero amount');
      const { error } = await supabase.from('driver_settlement_items').insert({
        org_id: orgId,
        settlement_id: settlementId,
        item_type: 'reimbursement',
        description: description.trim(),
        amount: amt,
      });
      if (error) throw error;
      const { error: rpcErr } = await supabase.rpc('recalc_settlement_totals', {
        _settlement_id: settlementId,
      });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      setDescription('');
      setAmount('');
      setAdding(false);
      toast.success('Reimbursement added');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to add reimbursement'),
  });

  const delMut = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('driver_settlement_items')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      const { error: rpcErr } = await supabase.rpc('recalc_settlement_totals', {
        _settlement_id: settlementId,
      });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      toast.success('Reimbursement removed');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to remove'),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Reimbursements</h4>
        {editable && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Truck parking, Tolls, Lumper"
              />
            </div>
            <div>
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDescription('');
                setAmount('');
              }}
              disabled={addMut.isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
              {addMut.isPending ? 'Adding…' : 'Add reimbursement'}
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-2">
          No reimbursements yet. {editable && 'Click Add to record one.'}
        </p>
      ) : rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {editable && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{r.description ?? '—'}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(Number(r.amount ?? 0))}
                </TableCell>
                {editable && (
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => delMut.mutate(r.id)}
                      disabled={delMut.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
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
