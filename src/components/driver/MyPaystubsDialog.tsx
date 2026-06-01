import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Download, Receipt, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

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

export function MyPaystubsDialog({ open, onOpenChange, driverId, driverName, payType, payRate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: paystubs = [], isLoading } = useQuery<DriverSettlement[]>({
    queryKey: ['my-paystubs', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlements')
        .select('*')
        .eq('driver_id', driverId)
        .in('status', ['approved', 'paid'])
        .order('period_end', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DriverSettlement[];
    },
    enabled: !!driverId && open,
  });

  const selected = useMemo(
    () => paystubs.find((p) => p.id === selectedId) ?? null,
    [paystubs, selectedId],
  );

  const isFlat = (payType || '').toLowerCase() === 'flat';
  const baseLabel = isFlat ? 'Flat Rate Guarantee' : 'Load Earnings';

  const handleDownload = (p: DriverSettlement) => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const W = doc.internal.pageSize.getWidth();
      let y = 60;

      // Header band
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 80, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('PAYSTUB', 40, 45);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(fmtPeriod(p.period_start, p.period_end), 40, 65);

      // Driver block
      y = 120;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Paid To', 40, y);
      doc.setFont('helvetica', 'normal');
      doc.text(driverName, 40, y + 16);

      doc.setFont('helvetica', 'bold');
      doc.text('Status', W - 200, y);
      doc.setFont('helvetica', 'normal');
      doc.text((p.status || 'approved').toUpperCase(), W - 200, y + 16);

      // Earnings table
      y = 200;
      doc.setDrawColor(226, 232, 240);
      doc.line(40, y, W - 40, y);
      y += 24;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Earnings', 40, y);
      y += 20;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);

      const drawLine = (label: string, amount: number, sub?: string) => {
        doc.text(label, 40, y);
        if (sub) {
          doc.setTextColor(120, 120, 120);
          doc.setFontSize(9);
          doc.text(sub, 40, y + 12);
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(11);
        }
        const amt = formatCurrency(amount);
        const aw = doc.getTextWidth(amt);
        doc.text(amt, W - 40 - aw, y);
        y += sub ? 30 : 22;
      };

      drawLine(baseLabel, Number(p.base_pay ?? 0));
      const bonus = Number(p.bonus_pay ?? 0);
      if (bonus > 0) drawLine('Bonus Pay', bonus, 'Safety / Performance');

      y += 6;
      doc.setDrawColor(226, 232, 240);
      doc.line(40, y, W - 40, y);
      y += 28;

      // Net pay box
      doc.setFillColor(241, 245, 249);
      doc.rect(40, y - 22, W - 80, 50, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('NET PAY', 56, y + 6);
      doc.setFontSize(18);
      const net = Number(p.net_pay ?? Number(p.base_pay ?? 0) + bonus);
      const netStr = formatCurrency(net);
      const nw = doc.getTextWidth(netStr);
      doc.text(netStr, W - 56 - nw, y + 8);

      // Footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Generated ${format(new Date(), 'PPpp')}`,
        40,
        doc.internal.pageSize.getHeight() - 30,
      );

      doc.save(`paystub-${p.period_start}-to-${p.period_end}.pdf`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not generate PDF');
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
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
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
                <DialogTitle>Paystub</DialogTitle>
              </div>
              <DialogDescription>{fmtPeriod(selected.period_start, selected.period_end)}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="capitalize">{selected.status}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(selected)}
                  >
                    <Download className="h-4 w-4 mr-2" /> Download PDF
                  </Button>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{baseLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {isFlat ? 'Guaranteed weekly rate' : 'Earned from delivered loads'}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(Number(selected.base_pay ?? 0))}
                    </p>
                  </div>

                  {Number(selected.bonus_pay ?? 0) > 0 && (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">Bonus Pay</p>
                        <p className="text-xs text-muted-foreground">Safety / Performance</p>
                      </div>
                      <p className="font-semibold tabular-nums text-success">
                        +{formatCurrency(Number(selected.bonus_pay ?? 0))}
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Net Pay</p>
                    <p className="text-xs text-muted-foreground">Total earnings</p>
                  </div>
                  <p className="text-3xl font-bold text-primary tabular-nums">
                    {formatCurrency(
                      Number(selected.net_pay ?? Number(selected.base_pay ?? 0) + Number(selected.bonus_pay ?? 0)),
                    )}
                  </p>
                </div>
              </div>

              {selected.notes && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes from payroll</p>
                  <p className="whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" /> My Paystubs
              </DialogTitle>
              <DialogDescription>Approved and paid paystubs for your records.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2 overflow-y-auto pr-1 -mr-1">
              {isLoading ? (
                <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
              ) : paystubs.length === 0 ? (
                <div className="text-center py-10">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No paystubs yet.</p>
                </div>
              ) : (
                paystubs.map((p) => {
                  const net = Number(p.net_pay ?? Number(p.base_pay ?? 0) + Number(p.bonus_pay ?? 0));
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className="w-full flex items-center justify-between rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-colors px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{fmtPeriod(p.period_start, p.period_end)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="capitalize text-xs">{p.status}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-primary tabular-nums">{formatCurrency(net)}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
