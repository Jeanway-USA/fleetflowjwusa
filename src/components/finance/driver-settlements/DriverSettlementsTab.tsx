import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';
import { GenerateSettlementsDialog } from './GenerateSettlementsDialog';
import { SettlementDetailSheet } from './SettlementDetailSheet';

type DriverSettlement = Database['public']['Tables']['driver_settlements']['Row'] & {
  payment_date?: string | null;
  gross_pay?: number | null;
  fuel_advances?: number | null;
  reimbursements?: number | null;
  ytd_gross?: number | null;
  ytd_deductions?: number | null;
  ytd_net?: number | null;
};

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
}

const STATUS_OPTIONS = ['all', 'draft', 'approved', 'paid'] as const;

function driverName(d?: Driver | null) {
  if (!d) return '—';
  return `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || '—';
}

export function DriverSettlementsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [viewSettlementId, setViewSettlementId] = useState<string | null>(null);

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status');
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
    if (statusFilter === 'all') return settlements;
    return settlements.filter((s) => s.status === statusFilter);
  }, [settlements, statusFilter]);

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
      const { error } = await supabase.from('driver_settlements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver_settlements'] });
      toast.success('Settlement deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card className="card-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Settlement Statements
            </CardTitle>
            <CardDescription>
              Generate paystubs on demand. Pick the drivers, pay period end, and payment date.
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
            <CardDescription>All settlement statements across drivers and pay periods.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">YTD Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No settlement statements yet. Click "Generate Settlements" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => {
                    const grossTotal =
                      Number(s.gross_pay ?? s.base_pay ?? 0) +
                      Number(s.bonus_pay ?? 0) +
                      Number(s.reimbursements ?? 0);
                    const deductTotal =
                      Number(s.deductions ?? 0) + Number(s.fuel_advances ?? 0);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {driverName(driverMap.get(s.driver_id))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(`${s.period_start}T00:00:00`), 'MMM d')} –{' '}
                          {format(parseISO(`${s.period_end}T00:00:00`), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.payment_date
                            ? format(parseISO(`${s.payment_date}T00:00:00`), 'MMM d, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(grossTotal)}</TableCell>
                        <TableCell className="text-right text-destructive">
                          {formatCurrency(deductTotal)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(Number(s.net_pay ?? 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {formatCurrency(Number(s.ytd_net ?? 0))}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell>
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
                                  onClick={() => updateStatus.mutate({ id: s.id, status: 'paid' })}
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
