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
import { Check, Download, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';
import { fetchPayBreakdown, type PayBreakdown } from '@/lib/settlement-pay-breakdown';
import { useSettlementDiscrepancies } from '@/hooks/useSettlementDiscrepancies';
import { StatementDiscrepancyPanel } from '@/components/finance/StatementDiscrepancyPanel';


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
  const [editMode, setEditMode] = useState(false);
  const { data: discrepancies = [] } = useSettlementDiscrepancies(settlementId);
  const unresolvedDiscrepancies = discrepancies.filter(d => !d.resolved_at);
  const hasBlockingDiscrepancy = unresolvedDiscrepancies.length > 0;


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



  const currentGross = Number(settlement?.gross_pay ?? 0);
  const currentReimb = Number(settlement?.reimbursements ?? 0);
  const currentDed = Number(settlement?.deductions ?? 0);
  const currentNet = currentGross + currentReimb - currentDed;
  const ytdGross = Number(settlement?.ytd_gross ?? 0);
  const ytdReimb = Number(settlement?.ytd_reimbursements ?? 0);
  const ytdDed = Number(settlement?.ytd_deductions ?? 0);
  const ytdNet = ytdGross + ytdReimb - ytdDed;



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
      <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0 overflow-hidden">
        <SheetHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b pr-12">
          <SheetTitle className="text-base sm:text-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="truncate">Settlement — {driverName}</span>
            {settlement && (
              <span className="shrink-0">
                <StatusBadge status={settlement.status} />
              </span>
            )}
          </SheetTitle>
          {settlement && (
            <SheetDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-xs sm:text-sm">
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
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {settlement.status === 'draft' && (
                  <Button
                    size="sm"
                    variant={editMode ? 'default' : 'outline'}
                    onClick={() => setEditMode((v) => !v)}
                    className="w-full sm:w-auto"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {editMode ? 'Done Editing' : 'Edit Settlement'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(`/settlements/${settlement.id}/print`, '_blank', 'noopener')
                  }
                  className="w-full sm:w-auto"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Preview Statement
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                  disabled={downloading || hasBlockingDiscrepancy}
                  className="w-full sm:w-auto"
                  title={hasBlockingDiscrepancy ? 'Resolve discrepancies before generating PDF' : undefined}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloading ? 'Generating…' : 'Download PDF'}
                </Button>
              </div>
            </SheetDescription>
          )}
        </SheetHeader>

        {settlement && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryStat label="Gross Pay" value={currentGross} />
              <SummaryStat label="Reimbursements" value={currentReimb} />
              <SummaryStat label="Deductions" value={-Math.abs(currentDed)} negative />
              <SummaryStat label="Net Pay" value={currentNet} primary />
            </div>

            {hasBlockingDiscrepancy && (
              <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive">
                Settlement locked — {unresolvedDiscrepancies.length} unresolved statement discrepancy/ies. Approval, generation, and PDF export are disabled until resolved.
              </div>
            )}

            {discrepancies.length > 0 && (
              <StatementDiscrepancyPanel
                discrepancies={discrepancies}
                title="Statement Line Errors"
                canResolve
              />
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Year-to-Date (Proof of Income)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">YTD Gross</p>
                    <p className="font-semibold">{formatCurrency(ytdGross)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">YTD Reimbursements</p>
                    <p className="font-semibold">{formatCurrency(ytdReimb)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">YTD Deductions</p>
                    <p className="font-semibold text-red-600">
                      {formatCurrency(-Math.abs(ytdDed))}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">YTD Net</p>
                    <p className="font-semibold text-primary">{formatCurrency(ytdNet)}</p>
                  </div>
                </div>
                <p className="text-[11px] italic text-muted-foreground mt-3">
                  Calculation Note: Net Pay = Gross Pay + Reimbursements − Deductions
                </p>
              </CardContent>
            </Card>

            <EarningsBreakdown breakdown={breakdown} />

            <LineItemsSplit
              items={items as any[]}
              settlementId={settlement.id}
              orgId={settlement.org_id}
              editable={settlement.status === 'draft'}
              editMode={editMode && settlement.status === 'draft'}
            />


          </div>
        )}


        <div className="border-t px-4 sm:px-6 py-3 bg-background flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
          {settlement && (
            <Button
              onClick={handleDownload}
              disabled={downloading || hasBlockingDiscrepancy}
              className="w-full sm:w-auto hidden sm:inline-flex"
              title={hasBlockingDiscrepancy ? 'Resolve discrepancies before generating PDF' : undefined}
            >
              <Download className="h-4 w-4 mr-2" />
              {downloading ? 'Generating…' : 'Download PDF'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


const DEDUCTION_PRESETS = [
  'Escrow',
  'Plate Fee',
  'Insurance',
  'Fuel Advance',
  'IFTA',
  'Truck Lease',
  'ELD / Tech Fee',
  'Other',
];

const EARNINGS_TYPES = new Set(['load_pay', 'load_earnings', 'accessorial', 'reimbursement']);

type Side = 'earnings' | 'deductions';

interface LineItemRow {
  id: string;
  description: string | null;
  amount: number | null;
  item_type: string;
  is_escrow?: boolean | null;
}

function LineItemsSplit({
  items,
  settlementId,
  orgId,
  editable,
}: {
  items: LineItemRow[];
  settlementId: string;
  orgId: string;
  editable: boolean;
}) {
  const earnings = items.filter((i) => EARNINGS_TYPES.has(i.item_type));
  const deductions = items.filter((i) => i.item_type === 'deduction');

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-border">
        <LineItemColumn
          side="earnings"
          title="EARNINGS & ADDITIONS"
          rows={earnings}
          settlementId={settlementId}
          orgId={orgId}
          editable={editable}
          emptyText="No earnings recorded yet"
        />
        <LineItemColumn
          side="deductions"
          title="DEDUCTIONS & ESCROWS"
          rows={deductions}
          settlementId={settlementId}
          orgId={orgId}
          editable={editable}
          emptyText="No deductions in this period"
        />
      </div>
    </div>
  );
}

function LineItemColumn({
  side,
  title,
  rows,
  settlementId,
  orgId,
  editable,
  emptyText,
}: {
  side: Side;
  title: string;
  rows: LineItemRow[];
  settlementId: string;
  orgId: string;
  editable: boolean;
  emptyText: string;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [preset, setPreset] = useState<string>('Escrow');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['driver_settlement_items', settlementId] });
    qc.invalidateQueries({ queryKey: ['driver_settlement', settlementId] });
    qc.invalidateQueries({ queryKey: ['driver_settlements'] });
  };

  const resetForm = () => {
    setAdding(false);
    setDescription('');
    setAmount('');
    setPreset('Escrow');
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const amt = Math.abs(parseFloat(amount));
      const label =
        side === 'deductions'
          ? preset === 'Other'
            ? description.trim()
            : preset
          : description.trim();
      if (!label) throw new Error('Description required');
      if (!Number.isFinite(amt) || amt === 0) throw new Error('Enter a non-zero amount');

      const payload: Record<string, unknown> = {
        org_id: orgId,
        settlement_id: settlementId,
        item_type: side === 'deductions' ? 'deduction' : 'reimbursement',
        description: label,
        amount: amt,
      };
      if (side === 'deductions' && (preset === 'Escrow' || /escrow/i.test(label))) {
        payload.is_escrow = true;
      }

      const { error } = await supabase.from('driver_settlement_items').insert(payload as any);
      if (error) throw error;
      const { error: rpcErr } = await supabase.rpc('recalc_settlement_totals', {
        _settlement_id: settlementId,
      });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      toast.success(side === 'deductions' ? 'Deduction added' : 'Line item added');
      resetForm();
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to add line item'),
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
      toast.success('Removed');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to remove'),
  });

  const negative = side === 'deductions';

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b bg-muted/30">
        <h4 className="text-[11px] font-bold tracking-wider text-muted-foreground">{title}</h4>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="py-1.5 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              Description
            </TableHead>
            <TableHead className="py-1.5 px-3 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
              Amount
            </TableHead>
            {editable && <TableHead className="w-8 py-1.5 px-2" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={editable ? 3 : 2}
                className="py-3 px-3 text-sm italic text-muted-foreground text-center"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const amt = Number(r.amount ?? 0);
              return (
                <TableRow key={r.id} className="even:bg-muted/40">
                  <TableCell className="py-1.5 px-3 text-sm">
                    <span className="text-foreground">{r.description ?? '—'}</span>
                    {r.is_escrow && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-[10px] py-0 px-1.5 align-middle"
                      >
                        Escrow
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className={`py-1.5 px-3 text-right font-medium tabular-nums ${
                      negative ? 'text-destructive' : ''
                    }`}
                  >
                    {formatCurrency(negative ? -Math.abs(amt) : amt)}
                  </TableCell>
                  {editable && (
                    <TableCell className="py-1.5 px-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => delMut.mutate(r.id)}
                        disabled={delMut.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {editable && (
        <div className="border-t">
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full text-left py-2 px-3 text-sm text-primary hover:bg-muted/40 inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Manual Line Item
            </button>
          ) : (
            <div className="p-3 space-y-2 bg-muted/20">
              {side === 'deductions' && (
                <div>
                  <Label className="text-xs">Preset</Label>
                  <select
                    value={preset}
                    onChange={(e) => {
                      setPreset(e.target.value);
                      if (e.target.value !== 'Other') setDescription('');
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {DEDUCTION_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(side === 'earnings' || preset === 'Other') && (
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      side === 'earnings'
                        ? 'e.g. Tolls, Lumper, Layover'
                        : 'e.g. Tire chains, Permit'
                    }
                    className="h-9"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-9 tabular-nums"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetForm}
                  disabled={addMut.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => addMut.mutate()}
                  disabled={addMut.isPending}
                >
                  {addMut.isPending ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}





function SummaryStat({
  label,
  value,
  primary,
  negative,
}: {
  label: string;
  value: number;
  primary?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`rounded-md border p-3 ${primary ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-semibold ${primary ? 'text-primary text-lg' : ''} ${negative ? 'text-red-600' : ''}`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}


function EarningsBreakdown({ breakdown }: { breakdown: PayBreakdown | undefined }) {
  if (!breakdown) {
    return (
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Earnings Breakdown</h4>
        <p className="text-sm text-muted-foreground py-2">Loading…</p>
      </div>
    );
  }

  const fmtMi = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold">Earnings Breakdown</h4>
        <Badge variant="outline" className="font-medium">
          {breakdown.methodLabel}
        </Badge>
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Pay Calculation
        </span>
        <span className="font-semibold text-foreground">{breakdown.formulaLabel}</span>
      </div>

      {breakdown.payType === 'flat' && (
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Load #</TableHead>
                <TableHead>Origin → Destination</TableHead>
                <TableHead className="text-right">Miles</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.loads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No loads recorded in this period
                  </TableCell>
                </TableRow>
              ) : (
                breakdown.loads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.delivery_date || l.pickup_date
                        ? format(
                            parseISO(`${l.delivery_date ?? l.pickup_date}T00:00:00`),
                            'MM/dd/yyyy',
                          )
                        : '—'}
                    </TableCell>
                    <TableCell>{l.landstar_load_id || l.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.origin} → {l.destination}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtMi(Number(l.booked_miles ?? l.actual_miles ?? 0))}
                    </TableCell>
                    <TableCell className="capitalize">
                      {(l.status ?? '').replace('_', ' ')}
                    </TableCell>
                  </TableRow>
                ))
              )}
              <TableRow className="bg-muted/40">
                <TableCell colSpan={4} className="text-right font-semibold">
                  Flat Rate Base Pay
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(breakdown.basePay)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}


      {breakdown.payType === 'per_mile' && (
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <Table className="min-w-[640px]">

          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Load #</TableHead>
              <TableHead>Origin → Destination</TableHead>
              <TableHead className="text-right">Loaded Miles</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.loads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No completed loads in this period
                </TableCell>
              </TableRow>
            ) : (
              breakdown.loads.map((l) => {
                const mi = Number(l.booked_miles ?? l.actual_miles ?? 0);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.delivery_date
                        ? format(parseISO(`${l.delivery_date}T00:00:00`), 'MM/dd/yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell>{l.landstar_load_id || l.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.origin} → {l.destination}
                    </TableCell>
                    <TableCell className="text-right">{fmtMi(mi)}</TableCell>
                    <TableCell className="text-right">
                      ${breakdown.payRate.toFixed(2)}/mi
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(mi * breakdown.payRate)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            <TableRow className="bg-muted/40">
              <TableCell colSpan={3} className="font-semibold">
                Totals
              </TableCell>
              <TableCell className="text-right font-semibold">
                {fmtMi(breakdown.totalLoadedMiles)} mi
              </TableCell>
              <TableCell />
              <TableCell className="text-right font-semibold">
                {formatCurrency(breakdown.basePay)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        </div>
      )}

      {breakdown.payType === 'percentage' && (
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <Table className="min-w-[640px]">

          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Load #</TableHead>
              <TableHead>Origin → Destination</TableHead>
              <TableHead className="text-right">Linehaul</TableHead>
              <TableHead className="text-right">
                After {(breakdown.truckSplit * 100).toFixed(0)}% Split
              </TableHead>
              <TableHead className="text-right">Driver {breakdown.payRate}%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.loads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No completed loads in this period
                </TableCell>
              </TableRow>
            ) : (
              breakdown.loads.map((l) => {
                const linehaul = Number(l.rate ?? 0);
                const afterSplit = linehaul * breakdown.truckSplit;
                const driverShare = afterSplit * (breakdown.payRate / 100);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.delivery_date
                        ? format(parseISO(`${l.delivery_date}T00:00:00`), 'MM/dd/yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell>{l.landstar_load_id || l.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.origin} → {l.destination}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(linehaul)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(afterSplit)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(driverShare)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            <TableRow className="bg-muted/40">
              <TableCell colSpan={3} className="font-semibold">
                Totals
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(breakdown.totalLinehaul)}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(breakdown.totalAfterSplit)}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(breakdown.basePay)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        </div>
      )}

    </div>
  );
}

