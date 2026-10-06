import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Panel } from '@/components/finance/statement-ui';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { archiveWithUndo } from '@/lib/soft-delete';
import {
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
        .is('deleted_at', null)
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
      await archiveWithUndo({
        table: 'driver_settlements',
        id,
        queryClient: qc,
        invalidateKeys: [
          ['driver_settlements'],
          ['driver_settlement_items'],
          ['driver_settlement', id],
        ],
      });
    },
    onSuccess: () => {
      /* archiveWithUndo handles toast + invalidation */
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

  const payMethod = (drv?: Driver | null) => {
    const pt = (drv?.pay_type ?? '').toLowerCase();
    const rate = Number(drv?.pay_rate ?? 0);
    if (pt === 'flat') return `Flat ${formatCurrency(rate)}`;
    if (pt === 'per_mile' || pt === 'cpm') return `$${rate.toFixed(2)}/mi`;
    if (pt === 'percentage') return `${rate}% split`;
    return '';
  };
  const periodLabel = (st: any) =>
    `${format(parseISO(`${st.period_start}T00:00:00`), 'MMM d')} to ${format(parseISO(`${st.period_end}T00:00:00`), 'MMM d, yyyy')}`;

  const actions = (st: any) => {
    const isDownloading = downloadingId === st.id;
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleDownload(st.id)} disabled={isDownloading} aria-label="Download PDF">
          <Download className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewSettlementId(st.id)}>
              <Eye className="mr-2 h-4 w-4" /> View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload(st.id)} disabled={isDownloading}>
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </DropdownMenuItem>
            {st.status === 'draft' && (
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: st.id, status: 'approved' })}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
              </DropdownMenuItem>
            )}
            {st.status === 'approved' && (
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: st.id, status: 'paid' })}>
                <DollarSign className="mr-2 h-4 w-4" /> Mark paid
              </DropdownMenuItem>
            )}
            {st.status !== 'draft' && (
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: st.id, status: 'draft' })}>
                Revert to draft
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                if (confirm('Delete this settlement statement? This cannot be undone.')) {
                  deleteSettlement.mutate(st.id);
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <Button key={label} variant={active ? 'default' : 'outline'} className="h-11 rounded-full px-4 capitalize" aria-pressed={active} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <div className="space-y-6">
      <Panel
        title="Driver settlements"
        description="Paystubs for your drivers, every pay period. Approved and paid statements count as driver pay on the Profit & loss tab."
        flush
        aside={
          <Button className="h-11 gap-2" onClick={() => setGenerateOpen(true)}>
            <Receipt className="h-4 w-4" /> Generate settlements
          </Button>
        }
      >
        <div className="space-y-2 px-4 pb-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
            {STATUS_OPTIONS.map((st) => chip(statusFilter === st, st, () => setStatusFilter(st)))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by driver type">
            {TYPE_OPTIONS.map((opt) => chip(typeFilter === opt.value, opt.label, () => setTypeFilter(opt.value)))}
          </div>
        </div>

        {isLoading ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">Loading settlements.</p>
        ) : filtered.length === 0 ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">
            No settlement statements match. Use Generate settlements to create one.
          </p>
        ) : (
          <>
            {/* Phone: one card per statement */}
            <ul className="divide-y border-t md:hidden">
              {filtered.map((st: any) => {
                const drv = driverMap.get(st.driver_id);
                const method = payMethod(drv);
                return (
                  <li key={st.id} className="flex items-start gap-1 py-1 pl-4 pr-1">
                    <div className="min-w-0 flex-1 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{driverName(drv)}</span>
                        <span className="figure text-lg font-bold">{formatCurrency(Number(st.net_pay ?? 0))}</span>
                      </div>
                      <div className="text-[13px] text-muted-foreground">{periodLabel(st)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
                        <StatusBadge status={st.status} />
                        <span>Gross {formatCurrency(Number(st.gross_pay ?? 0))}{method ? `, ${method}` : ''}</span>
                        {Number(st.reimbursements ?? 0) > 0 && <span>Reimbursed {formatCurrency(Number(st.reimbursements))}</span>}
                      </div>
                    </div>
                    {actions(st)}
                  </li>
                );
              })}
            </ul>

            {/* Desktop: the table */}
            <div className="hidden overflow-x-auto border-t md:block">
              <table className="w-full text-[15px]">
                <caption className="sr-only">Driver settlement statements</caption>
                <thead>
                  <tr className="border-b text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-4 py-2">Driver</th>
                    <th scope="col" className="py-2">Pay period</th>
                    <th scope="col" className="py-2 text-right">Gross pay</th>
                    <th scope="col" className="py-2 text-right">Reimbursements</th>
                    <th scope="col" className="py-2 text-right">Net pay</th>
                    <th scope="col" className="py-2 pl-6">Status</th>
                    <th scope="col" className="w-28 py-2 pr-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((st: any) => {
                    const drv = driverMap.get(st.driver_id);
                    const method = payMethod(drv);
                    return (
                      <tr key={st.id}>
                        <td className="px-4 py-2 font-medium">{driverName(drv)}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{periodLabel(st)}</td>
                        <td className="py-2 text-right">
                          <div className="figure">{formatCurrency(Number(st.gross_pay ?? 0))}</div>
                          {method && <div className="text-[13px] text-muted-foreground">{method}</div>}
                        </td>
                        <td className="figure py-2 text-right">{formatCurrency(Number(st.reimbursements ?? 0))}</td>
                        <td className="figure py-2 text-right text-lg font-bold">{formatCurrency(Number(st.net_pay ?? 0))}</td>
                        <td className="py-2 pl-6"><StatusBadge status={st.status} /></td>
                        <td className="py-1 pr-2">{actions(st)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

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
