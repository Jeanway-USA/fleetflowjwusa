import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RefreshCw, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

const currency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'default';
    case 'approved':
      return 'secondary';
    case 'void':
      return 'destructive';
    default:
      return 'outline';
  }
}

function buildMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  // Include current + 12 prior months
  for (let i = 0; i < 13; i++) {
    const d = startOfMonth(subMonths(now, i));
    options.push({
      value: format(d, 'yyyy-MM-dd'),
      label: format(d, 'MMMM yyyy'),
    });
  }
  return options;
}

export function SafetyBonusPayouts() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();

  const monthOptions = useMemo(() => buildMonthOptions(), []);
  // Default to the current calendar month — matches the driver dashboard bonus widget.
  const [periodStart, setPeriodStart] = useState<string>(() =>
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  );

  const periodDate = useMemo(() => new Date(`${periodStart}T00:00:00`), [periodStart]);
  const periodEndDate = useMemo(() => endOfMonth(periodDate), [periodDate]);
  const isCurrentMonth = useMemo(
    () => format(startOfMonth(new Date()), 'yyyy-MM-dd') === periodStart,
    [periodStart],
  );
  const periodLabel = format(periodDate, 'MMMM yyyy');
  const periodRange = `${format(periodDate, 'MMM d')} – ${format(periodEndDate, 'MMM d, yyyy')}`;


  const payoutsQuery = useQuery({
    queryKey: ['safety-bonus-payouts', orgId, periodStart],
    enabled: !!orgId,
    queryFn: async () => {
      // No foreign key links payouts to drivers in the database, so a joined select is rejected
      // (400). Load the payouts, then attach each driver's name here.
      const { data, error } = await supabase
        .from('safety_bonus_payouts')
        .select('*')
        .eq('org_id', orgId!)
        .eq('period_start', periodStart)
        .is('deleted_at', null)
        .order('earned_amount', { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const driverIds = [...new Set(rows.map((r) => r.driver_id).filter(Boolean))] as string[];
      if (driverIds.length === 0) return rows.map((r) => ({ ...r, drivers: null as { first_name: string; last_name: string } | null }));
      const { data: driverRows, error: driversError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .in('id', driverIds);
      if (driversError) throw driversError;
      const byId = new Map((driverRows ?? []).map((d) => [d.id, { first_name: d.first_name, last_name: d.last_name }]));
      return rows.map((r) => ({ ...r, drivers: byId.get(r.driver_id) ?? null }));
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_safety_bonus_payouts', {
        _period_start: periodStart,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ earned_amount: number | string }>;
    },
    onSuccess: (rows) => {
      toast.success(`Payouts generated for ${periodLabel}`);
      const allZero = rows.length > 0 && rows.every((r) => Number(r.earned_amount ?? 0) === 0);
      if (allZero) {
        toast.info(
          `No driver earned a bonus in ${periodLabel}. If you expected one, check another month — activity may fall outside this period.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['safety-bonus-payouts', orgId, periodStart] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to generate payouts'),
  });


  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === 'paid') patch.paid_at = new Date().toISOString();
      const { error } = await supabase.from('safety_bonus_payouts').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Payout updated');
      queryClient.invalidateQueries({ queryKey: ['safety-bonus-payouts', orgId, periodStart] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to update payout'),
  });

  const payouts = payoutsQuery.data ?? [];
  const totalPending = payouts
    .filter((p: any) => p.status === 'pending' || p.status === 'approved')
    .reduce((sum: number, p: any) => sum + Number(p.earned_amount ?? 0), 0);
  const totalPaid = payouts
    .filter((p: any) => p.status === 'paid')
    .reduce((sum: number, p: any) => sum + Number(p.earned_amount ?? 0), 0);

  const rowMenu = (p: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={updateStatusMutation.isPending} aria-label="Payout actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {p.status !== 'approved' && p.status !== 'paid' && (
          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: p.id, status: 'approved' })}>Approve</DropdownMenuItem>
        )}
        {p.status !== 'paid' && (
          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: p.id, status: 'paid' })}>Mark paid</DropdownMenuItem>
        )}
        {p.status !== 'pending' && (
          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: p.id, status: 'pending' })}>Reset to pending</DropdownMenuItem>
        )}
        {p.status !== 'void' && (
          <DropdownMenuItem className="text-destructive" onClick={() => updateStatusMutation.mutate({ id: p.id, status: 'void' })}>Void</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const nameOf = (p: any) => (p.drivers ? `${p.drivers.first_name} ${p.drivers.last_name}` : 'Unknown driver');

  return (
    <Panel
      title="Safety bonuses"
      description={
        <>
          Pay safe drivers a bonus each month. Generate a month to record what each driver earned, then mark it approved or paid.
          <span className="block tabular-nums">
            Period: {periodRange}
            {isCurrentMonth && ', month in progress, so totals will change'}
          </span>
        </>
      }
      flush
      aside={
        <>
          <Select value={periodStart} onValueChange={setPeriodStart}>
            <SelectTrigger className="h-11 w-44" aria-label="Month"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="h-11 gap-2" variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {generateMutation.isPending ? 'Generating' : `Generate for ${periodLabel}`}
          </Button>
        </>
      }
    >
      {payoutsQuery.isLoading ? (
        <div className="space-y-2 border-t px-4 py-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : payouts.length === 0 ? (
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">No bonuses recorded for {periodLabel} yet. Use Generate to record them.</p>
      ) : (
        <>
          <div className="px-4">
            <StatementLine label="Owed" note="Pending and approved" value={currency(totalPending)} />
            <StatementLine label="Paid" value={currency(totalPaid)} muted rule="single" />
          </div>

          <ul className="divide-y border-t md:hidden">
            {payouts.map((p: any) => (
              <li key={p.id} className="flex items-start gap-1 py-1 pl-4 pr-1">
                <div className="min-w-0 flex-1 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{nameOf(p)}</span>
                    <span className="figure text-base font-semibold">{currency(Number(p.earned_amount ?? 0))}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-foreground tabular-nums">
                    <Badge variant={statusVariant(p.status)} className="capitalize">{p.status}</Badge>
                    <span>{Number(p.safe_miles ?? 0).toLocaleString()} safe miles</span>
                  </div>
                  {p.notes && <div className="text-[13px] text-muted-foreground">{p.notes}</div>}
                </div>
                {rowMenu(p)}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto border-t md:block">
            <table className="w-full text-[15px]">
              <caption className="sr-only">Safety bonus payouts for {periodLabel}</caption>
              <thead>
                <tr className="border-b text-left text-[12px] font-semibold text-muted-foreground">
                  <th scope="col" className="px-4 py-2">Driver</th>
                  <th scope="col" className="py-2 text-right">Safe miles</th>
                  <th scope="col" className="py-2 text-right">Earned</th>
                  <th scope="col" className="py-2 pl-6">Status</th>
                  <th scope="col" className="w-12 py-2 pr-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payouts.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{nameOf(p)}</div>
                      {p.notes && <div className="text-[13px] text-muted-foreground">{p.notes}</div>}
                    </td>
                    <td className="figure py-2 text-right">{Number(p.safe_miles ?? 0).toLocaleString()}</td>
                    <td className="figure py-2 text-right font-semibold">{currency(Number(p.earned_amount ?? 0))}</td>
                    <td className="py-2 pl-6"><Badge variant={statusVariant(p.status)} className="capitalize">{p.status}</Badge></td>
                    <td className="py-1 pr-2">{rowMenu(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

export default SafetyBonusPayouts;
