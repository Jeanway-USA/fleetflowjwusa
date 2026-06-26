import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Download, Receipt, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { useDriverSettlementsRealtime } from '@/hooks/useDriverSettlementsRealtime';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';

type DriverSettlement = Database['public']['Tables']['driver_settlements']['Row'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  payType: string | null;
  payRate: number | null;
}

function fmtPeriod(start: string, end: string) {
  const s = parseISO(`${start}T00:00:00`);
  const e = parseISO(`${end}T00:00:00`);
  return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
}

function CorporateHeader({ driverId }: { driverId: string }) {
  const id8 = (driverId || '').slice(0, 8).toUpperCase().padEnd(8, '0');
  return (
    <div className="space-y-0">
      <div className="font-mono text-[10px] text-zinc-400 tracking-wider px-1 pb-1 whitespace-nowrap overflow-x-auto">
        CO: JW &nbsp;&nbsp;&nbsp; FILE: {id8} &nbsp;&nbsp;&nbsp; DEPT: DISPATCH &nbsp;&nbsp;&nbsp; CLOCK: {id8} &nbsp;&nbsp;&nbsp; NUMBER: 00000000
      </div>
      <div className="bg-zinc-900 text-white px-5 py-4 border border-zinc-900 rounded-none">
        <p className="text-xl font-bold tracking-wide">JEANWAY USA</p>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-300 mt-0.5">LANDSTAR INWAY, INC. AGENT</p>
        <p className="text-[11px] text-zinc-400 mt-1 font-mono">4700 DIPLOMACY RD, FORT WORTH, TX 76155-2627</p>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-zinc-100 border-b border-zinc-200 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
      {children}
    </div>
  );
}

function GridRow({ label, sub, amount, tone }: { label: string; sub?: string; amount: number; tone?: 'positive' | 'negative' }) {
  const sign = tone === 'positive' ? '+' : tone === 'negative' ? '-' : '';
  const color = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-rose-700' : 'text-zinc-900';
  return (
    <div className="grid grid-cols-[1fr_auto] items-center py-1.5 px-3 even:bg-slate-50/50 border-b border-zinc-100 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-zinc-800 truncate">{label}</p>
        {sub && <p className="text-[11px] text-zinc-500 truncate">{sub}</p>}
      </div>
      <p className={`font-mono tabular-nums text-right ${color}`}>
        {sign}{formatCurrency(Math.abs(amount))}
      </p>
    </div>
  );
}

export function MyPaystubsDialog({ open, onOpenChange, driverId, driverName, payType, payRate: _payRate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: paystubs = [], isLoading } = useQuery<DriverSettlement[]>({
    queryKey: ['my-paystubs', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlements')
        .select('*')
        .eq('driver_id', driverId)
        .in('status', ['approved', 'paid'])
        .neq('status', 'draft')
        .order('period_end', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DriverSettlement[];
    },
    enabled: !!driverId && open,
    refetchOnWindowFocus: true,
  });

  // Live-invalidate when admin deletes / reverts a settlement
  useDriverSettlementsRealtime(driverId, open);

  const selected = useMemo(
    () => paystubs.find((p) => p.id === selectedId) ?? null,
    [paystubs, selectedId],
  );

  // If the currently-open settlement disappears (deleted or reverted to draft),
  // auto-return to the list so the driver cannot interact with an obsolete row.
  useEffect(() => {
    if (selectedId && paystubs.length > 0 && !paystubs.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [paystubs, selectedId]);

  // Itemized reimbursements / deductions for the selected paystub
  const { data: settlementItems = [] } = useQuery({
    queryKey: ['paystub-items', selected?.id],
    queryFn: async () => {
      if (!selected) return [] as Array<{ id: string; item_type: string; amount: number; description: string | null }>;
      const { data, error } = await supabase
        .from('driver_settlement_items')
        .select('id, item_type, amount, description')
        .eq('settlement_id', selected.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!selected,
  });

  const reimbursementItems = useMemo(
    () => settlementItems.filter((i) => i.item_type === 'reimbursement'),
    [settlementItems],
  );
  const deductionItems = useMemo(
    () => settlementItems.filter((i) => i.item_type === 'deduction'),
    [settlementItems],
  );

  const isFlat = (payType || '').toLowerCase() === 'flat';
  const baseLabel = isFlat ? 'Flat Rate Guarantee' : 'Load Earnings';

  const handleDownload = async (p: DriverSettlement) => {
    try {
      await generateSettlementPdf(p.id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not generate PDF');
    }
  };



  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelectedId(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl flex flex-col max-h-[90vh]">
        {selected ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-2"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>Settlement</DialogTitle>
              </div>
              <DialogDescription>{fmtPeriod(selected.period_start, selected.period_end)}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto pr-1">
              <CorporateHeader driverId={driverId} />

              <div className="flex items-center justify-between">
                <div className="font-mono text-[11px] uppercase tracking-wider text-zinc-600">
                  <span className="text-zinc-400">PAID TO:</span> {driverName}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize rounded-none">{selected.status}</Badge>
                  <Button size="sm" variant="outline" className="rounded-none" onClick={() => handleDownload(selected)}>
                    <Download className="h-4 w-4 mr-2" /> PDF
                  </Button>
                </div>
              </div>

              {/* Dense bordered grid */}
              <div className="border border-zinc-200 rounded-none shadow-none bg-white">
                <SectionHeader>Earnings</SectionHeader>
                <GridRow
                  label={baseLabel}
                  sub={isFlat ? 'Guaranteed weekly rate' : 'Earned from delivered loads'}
                  amount={Number(selected.gross_pay ?? 0)}
                />

                {(reimbursementItems.length > 0 || Number(selected.reimbursements ?? 0) > 0) && (
                  <>
                    <SectionHeader>Reimbursements</SectionHeader>
                    {reimbursementItems.length > 0 ? (
                      reimbursementItems.map((r) => (
                        <GridRow
                          key={r.id}
                          label={r.description || 'Reimbursement'}
                          amount={Number(r.amount ?? 0)}
                          tone="positive"
                        />
                      ))
                    ) : (
                      <GridRow
                        label="Reimbursements"
                        sub="Parking, tolls, etc."
                        amount={Number(selected.reimbursements ?? 0)}
                        tone="positive"
                      />
                    )}
                  </>
                )}

                {deductionItems.length > 0 && (
                  <>
                    <SectionHeader>Deductions</SectionHeader>
                    {deductionItems.map((d) => (
                      <GridRow
                        key={d.id}
                        label={d.description || 'Deduction'}
                        amount={Number(d.amount ?? 0)}
                        tone="negative"
                      />
                    ))}
                  </>
                )}

                {/* Net pay band */}
                <div className="grid grid-cols-[1fr_auto] items-center bg-zinc-900 text-white px-3 py-2.5">
                  <p className="font-mono text-xs uppercase tracking-[0.2em]">Net Pay</p>
                  <p className="font-mono text-lg tabular-nums font-bold">
                    {formatCurrency(
                      Number(selected.net_pay ?? Number(selected.gross_pay ?? 0) + Number(selected.reimbursements ?? 0)),
                    )}
                  </p>
                </div>
              </div>

              {/* Detachable Check Voucher */}
              <div className="mt-2 border-2 border-dashed border-zinc-300 bg-zinc-50/40 p-4 relative min-h-[110px] overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="-rotate-12 font-mono text-[13px] tracking-[0.3em] text-zinc-300/80 whitespace-nowrap">
                    NON-NEGOTIABLE — FOR RECORD PURPOSES ONLY
                  </span>
                </div>
                <div className="relative grid grid-cols-3 gap-4 text-[11px] font-mono">
                  <div>
                    <p className="text-zinc-500 uppercase tracking-wider">Bank Routing</p>
                    <p className="text-zinc-800">XXXX-XXXX-0000</p>
                    <p className="text-zinc-500 mt-2">Acct ••••0000</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 uppercase tracking-wider">Voucher #</p>
                    <p className="text-zinc-800">JW-{selected.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-500 uppercase tracking-wider">Net Pay Distribution</p>
                    <p className="font-bold text-lg text-zinc-900 tabular-nums">
                      {formatCurrency(
                        Number(selected.net_pay ?? Number(selected.gross_pay ?? 0) + Number(selected.reimbursements ?? 0)),
                      )}
                    </p>
                  </div>
                </div>
                <div className="relative mt-4 pt-2 border-t border-zinc-400/50 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Authorized Signature ____________________________________
                </div>
              </div>

              {selected.notes && (
                <div className="border border-zinc-200 rounded-none p-3 text-sm bg-white">
                  <p className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-1">Notes from Payroll</p>
                  <p className="whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" /> My Settlements
              </DialogTitle>
              <DialogDescription>Approved and paid settlements for your records.</DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto pr-1 -mr-1">
              <div className="border border-zinc-200 rounded-none bg-white">
                {isLoading ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
                ) : paystubs.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No settlements yet.</p>
                  </div>
                ) : (
                  paystubs.map((p) => {
                    const net = Number(p.net_pay ?? Number(p.gross_pay ?? 0) + Number(p.reimbursements ?? 0));
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className="w-full flex items-center justify-between border-b border-zinc-100 even:bg-slate-50/50 hover:bg-zinc-100/60 transition-colors px-3 py-2 text-left"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <p className="font-medium truncate text-sm">{fmtPeriod(p.period_start, p.period_end)}</p>
                          <Badge variant="secondary" className="capitalize text-[10px] rounded-none">{p.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-semibold text-zinc-900 tabular-nums">{formatCurrency(net)}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
