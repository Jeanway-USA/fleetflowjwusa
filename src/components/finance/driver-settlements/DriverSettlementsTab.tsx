import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import {
  FileText,
  MoreHorizontal,
  CheckCircle2,
  DollarSign,
  Receipt,
  Eye,
  Download,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';
import { GenerateSettlementsDialog } from './GenerateSettlementsDialog';
import { SettlementDetailSheet } from './SettlementDetailSheet';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';
import { W2PayrollHistoryCard } from '@/components/finance/payroll/W2PayrollHistoryCard';

type DriverSettlement = Database['public']['Tables']['driver_settlements']['Row'];

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  pay_type: string | null;
  pay_rate: number | null;
  employment_type: string | null;
}


const STATUS_OPTIONS = ['all', 'draft', 'approved', 'paid'] as const;
type TypeFilter = 'all' | 'w2' | 'contractor';
const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'w2', label: 'W-2 Company Payroll' },
  { value: 'contractor', label: '1099/Lease Settlements' },
];


function driverName(d?: Driver | null) {
  if (!d) return '—';
  return `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || '—';
}

export function DriverSettlementsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [viewSettlementId, setViewSettlementId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status, pay_type, pay_rate, employment_type');
      if (error) throw error;
      return (data ?? []) as Driver[];
    },
  });



  const { data: settlements = [], isLoading } = useQuery<DriverSettlement[]>({
    queryKey: ['driver_settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlements')
        .select('*')
        .order('period_end', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DriverSettlement[];
    },
  });

  const driverMap = useMemo(() => {
    const m = new Map<string, Driver>();
    drivers.forEach((d) => m.set(d.id, d));
    return m;
  }, [drivers]);

  const filtered = useMemo(() => {
    return settlements.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (typeFilter !== 'all') {
        const et = driverMap.get(s.driver_id)?.employment_type ?? 'w2_company';
        if (typeFilter === 'w2' && et !== 'w2_company') return false;
        if (typeFilter === 'contractor' && et !== '1099_contractor' && et !== 'lease_purchase') return false;
      }
      return true;
    });
  }, [settlements, statusFilter, typeFilter, driverMap]);


  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: 'draft' | 'approved' | 'paid';
    }) => {
      const patch: Record<string, unknown> = { status };
      if (status === 'approved') {
        patch.approved_at = new Date().toISOString();
        const { data: userRes } = await supabase.auth.getUser();
        patch.approved_by = userRes.user?.id ?? null;
      }
      if (status === 'paid') patch.paid_at = new Date().toISOString();
      const { error } = await supabase.from('driver_settlements').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver_settlements'] });
      toast.success('Settlement updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSettlement = useMutation({
    mutationFn: async (id: string) => {
      // Belt-and-suspenders: FK is ON DELETE CASCADE, but explicitly purge
      // child line items first so legacy DBs without the cascade also clean up.
      await supabase.from('driver_settlement_items').delete().eq('settlement_id', id);
      const { error } = await supabase.from('driver_settlements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      // Admin-side caches
      qc.invalidateQueries({ queryKey: ['driver_settlements'] });
      qc.invalidateQueries({ queryKey: ['driver_settlement_items'] });
      qc.invalidateQueries({ queryKey: ['driver_settlement', id] });
      // Driver-side caches are purged in real-time via the Realtime publication
      // on `driver_settlements` (see useDriverSettlementsRealtime).
      toast.success('Settlement deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      await generateSettlementPdf(id);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not generate PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <W2PayrollHistoryCard />

      <Card className="card-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Settlement Statements
            </CardTitle>
            <CardDescription>
              Generate paystubs on demand. Pick drivers, pay period end, and payment date.
            </CardDescription>
          </div>
          <Button
            size="lg"
            className="gradient-gold text-primary-foreground"
            onClick={() => setGenerateOpen(true)}
          >
            <Receipt className="h-4 w-4 mr-2" /> Generate Settlements
          </Button>
        </CardHeader>
      </Card>

      <Card className="card-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Generated Statements
            </CardTitle>
            <CardDescription>
              All settlement statements across drivers and pay periods.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <div className="px-6 pb-3 flex items-center gap-2 flex-wrap border-b">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Driver Type:</span>
          {TYPE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={typeFilter === opt.value ? 'default' : 'outline'}
              onClick={() => setTypeFilter(opt.value)}
              className="rounded-full"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <CardContent>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Pay Period</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Reimbursements</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No settlement statements yet. Click "Generate Settlements" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s: any) => {
                    const isDownloading = downloadingId === s.id;
                    const drv = driverMap.get(s.driver_id);
                    const pt = (drv?.pay_type ?? '').toLowerCase();
                    const rate = Number(drv?.pay_rate ?? 0);
                    let method = '';
                    if (pt === 'flat') method = `Flat ${formatCurrency(rate)}`;
                    else if (pt === 'per_mile' || pt === 'cpm')
                      method = `$${rate.toFixed(2)}/mi`;
                    else if (pt === 'percentage') method = `${rate}% split`;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {driverName(drv)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(`${s.period_start}T00:00:00`), 'MMM d')} –{' '}
                          {format(parseISO(`${s.period_end}T00:00:00`), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div>{formatCurrency(Number(s.gross_pay ?? 0))}</div>
                          {method && (
                            <div className="text-xs text-muted-foreground font-normal">
                              {method}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          {formatCurrency(Number(s.reimbursements ?? 0))}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(Number(s.net_pay ?? 0))}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(s.id)}
                              disabled={isDownloading}
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                              <span className="sr-only">Download PDF</span>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewSettlementId(s.id)}>
                                  <Eye className="mr-2 h-4 w-4" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDownload(s.id)}
                                  disabled={isDownloading}
                                >
                                  <Download className="mr-2 h-4 w-4" /> Download PDF
                                </DropdownMenuItem>
                                {s.status === 'draft' && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      updateStatus.mutate({ id: s.id, status: 'approved' })
                                    }
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                                  </DropdownMenuItem>
                                )}
                                {s.status === 'approved' && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      updateStatus.mutate({ id: s.id, status: 'paid' })
                                    }
                                  >
                                    <DollarSign className="mr-2 h-4 w-4" /> Mark Paid
                                  </DropdownMenuItem>
                                )}
                                {s.status !== 'draft' && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      updateStatus.mutate({ id: s.id, status: 'draft' })
                                    }
                                  >
                                    Revert to Draft
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        'Delete this settlement statement? This cannot be undone.',
                                      )
                                    ) {
                                      deleteSettlement.mutate(s.id);
                                    }
                                  }}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <GenerateSettlementsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        drivers={drivers.filter((d) => (d.status ?? 'active') === 'active')}
        onGenerated={() => {
          qc.invalidateQueries({ queryKey: ['driver_settlements'] });
        }}
      />

      <SettlementDetailSheet
        settlementId={viewSettlementId}
        onClose={() => setViewSettlementId(null)}
        driverMap={driverMap}
      />
    </div>
  );
}
