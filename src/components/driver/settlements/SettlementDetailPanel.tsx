import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';
import { bucketDeduction, netSettlement, useSettlementDetail, type SettlementRow } from '@/hooks/useDriverSettlementsPage';
import { Chip, DBtn, Note, Panel, PanelHead } from '@/components/driver/ui/driver-ui';
import { SettlementDonutChart, type DonutSlice } from './SettlementDonutChart';
import { SettlementAccordions } from './SettlementAccordions';

interface Props {
  settlement: SettlementRow | null;
}

function fmt(d: string) {
  try {
    return format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy');
  } catch {
    return d;
  }
}

const statusTone = (status: string) => (status === 'paid' ? 'good' : status === 'approved' ? 'active' : 'neutral');

export function SettlementDetailPanel({ settlement }: Props) {
  const { data, isLoading } = useSettlementDetail(settlement);
  const [downloading, setDownloading] = useState(false);

  const slices: DonutSlice[] = useMemo(() => {
    if (!settlement || !data) return [];
    const deductions = data.items.filter((i) => i.item_type === 'deduction');
    let agency = 0;
    let fuel = 0;
    let escrowDeduction = 0;
    let other = 0;
    for (const d of deductions) {
      const b = bucketDeduction(d.description);
      const amt = Number(d.amount ?? 0);
      if (b === 'agency') agency += amt;
      else if (b === 'fuel_advance') fuel += amt;
      else if (b === 'escrow' || b === 'insurance' || b === 'trailer') escrowDeduction += amt;
      else other += amt;
    }
    const net = netSettlement(settlement);
    return [
      { key: 'net', label: 'Take-home pay', value: Math.max(0, net), color: 'hsl(var(--success))' },
      { key: 'agency', label: 'Brokerage and agency split', value: agency, color: 'hsl(var(--carbon))' },
      { key: 'fuel', label: 'Fuel advances', value: fuel, color: 'hsl(var(--destructive))' },
      { key: 'deductions', label: 'Deductions and escrow', value: escrowDeduction + other, color: 'hsl(var(--muted-foreground))' },
    ];
  }, [data, settlement]);

  if (!settlement) {
    return (
      <Panel className="flex flex-col items-center px-6 py-12 text-center">
        <FileText className="mb-3 h-9 w-9 text-muted-foreground" aria-hidden />
        <p className="text-base font-semibold">Pick a statement</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a pay statement from the list to see where the money went.</p>
      </Panel>
    );
  }

  const net = netSettlement(settlement);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generateSettlementPdf(settlement.id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <span className="text-sm text-muted-foreground">{fmt(settlement.period_start)} to {fmt(settlement.period_end)}</span>
          <Chip tone={statusTone(settlement.status)} className="capitalize">{settlement.status}</Chip>
        </div>
        <div className="px-4 pb-4 pt-2">
          <p className="text-sm text-muted-foreground">Take-home pay</p>
          <p className="font-condensed text-5xl font-bold leading-tight tabular-nums">{formatCurrency(net)}</p>
          {settlement.payment_date && <p className="mt-1 text-xs text-muted-foreground">Paid {fmt(settlement.payment_date)}</p>}
        </div>
        <div className="border-t border-border px-4 py-4">
          {isLoading ? <Skeleton className="h-28 w-full" /> : <SettlementDonutChart total={Number(settlement.gross_pay ?? 0)} slices={slices} />}
        </div>
        <div className="border-t border-border p-3">
          <DBtn tone="secondary" size="lg" className="w-full" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            Download PDF
          </DBtn>
        </div>
      </Panel>

      {isLoading ? (
        <Panel>
          <PanelHead title="Breakdown" />
          <div className="space-y-3 px-4 pb-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        </Panel>
      ) : data ? (
        <SettlementAccordions settlement={settlement} items={data.items} loads={data.loads} accessorials={data.accessorials} netSettlementValue={net} />
      ) : (
        <Panel><Note>The breakdown could not be loaded.</Note></Panel>
      )}
    </div>
  );
}
