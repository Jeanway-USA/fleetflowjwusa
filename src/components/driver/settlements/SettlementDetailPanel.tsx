import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Loader2, FileText, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';
import {
  bucketDeduction,
  netSettlement,
  useSettlementDetail,
  type SettlementRow,
} from '@/hooks/useDriverSettlementsPage';
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

export function SettlementDetailPanel({ settlement }: Props) {
  const { data, isLoading } = useSettlementDetail(settlement);
  const [downloading, setDownloading] = useState(false);

  const slices: DonutSlice[] = useMemo(() => {
    if (!settlement || !data) return [];
    const items = data.items;
    const deductions = items.filter((i) => i.item_type === 'deduction');
    let agency = 0;
    let fuel = 0;
    let escrowDeduction = 0;
    let other = 0;
    for (const d of deductions) {
      const b = bucketDeduction(d.description);
      const amt = Number(d.amount ?? 0);
      if (b === 'agency') agency += amt;
      else if (b === 'fuel_advance') fuel += amt;
      else if (b === 'escrow' || b === 'insurance' || b === 'trailer')
        escrowDeduction += amt;
      else other += amt;
    }
    const net = netSettlement(settlement);
    return [
      {
        key: 'net',
        label: 'Net Settlement',
        value: Math.max(0, net),
        color: 'hsl(var(--success))',
      },
      {
        key: 'agency',
        label: 'Brokerage / Agency Split',
        value: agency,
        color: 'hsl(var(--primary))',
      },
      {
        key: 'fuel',
        label: 'Fuel Advances',
        value: fuel,
        color: 'hsl(var(--destructive))',
      },
      {
        key: 'deductions',
        label: 'Deductions / Escrow',
        value: escrowDeduction + other,
        color: 'hsl(var(--accent))',
      },
    ];
  }, [data, settlement]);

  if (!settlement) {
    return (
      <Card className="card-elevated h-full">
        <CardContent className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
          <div className="bg-muted/40 p-4 rounded-full mb-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-foreground">Select a settlement</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Pick a pay statement from the list to see the full revenue and deduction
            breakdown.
          </p>
        </CardContent>
      </Card>
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
    <Card className="card-elevated h-full">
      <CardContent className="p-6 space-y-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>
                {fmt(settlement.period_start)} – {fmt(settlement.period_end)}
              </span>
              <Badge variant="outline" className="capitalize ml-1">
                {settlement.status}
              </Badge>
            </div>
            {settlement.payment_date && (
              <p className="text-xs text-muted-foreground mt-1">
                Paid {fmt(settlement.payment_date)}
              </p>
            )}
          </div>
          <Button
            onClick={handleDownload}
            disabled={downloading}
            className="gap-2"
            size="lg"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </Button>
        </div>

        {/* Hero net settlement */}
        <div className="text-center py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Take-Home Pay
          </p>
          <p className="text-5xl lg:text-6xl font-bold tracking-tight text-foreground tabular-nums mt-2">
            {formatCurrency(net)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Net Settlement after deductions
          </p>
        </div>

        {/* Donut chart */}
        <div className="pt-2">
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <SettlementDonutChart total={Number(settlement.gross_pay ?? 0)} slices={slices} />
          )}
        </div>

        {/* Accordions */}
        <div className="pt-2">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            data && (
              <SettlementAccordions
                settlement={settlement}
                items={data.items}
                loads={data.loads}
                accessorials={data.accessorials}
                netSettlementValue={net}
              />
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
