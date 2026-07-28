import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Trophy, RefreshCw, MoreHorizontal } from 'lucide-react';
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
      const { data, error } = await supabase
        .from('safety_bonus_payouts')
        .select('*, drivers:driver_id ( first_name, last_name )')
        .eq('org_id', orgId!)
        .eq('period_start', periodStart)
        .is('deleted_at', null)
        .order('earned_amount', { ascending: false });
      if (error) throw error;
      return data ?? [];
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Safety Bonus Payouts
            </CardTitle>
            <CardDescription>
              Record and pay out monthly safety bonuses. Generate a month to snapshot each driver's
              earned amount, then mark payouts approved or paid.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={periodStart} onValueChange={setPeriodStart}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              variant="outline"
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${generateMutation.isPending ? 'animate-spin' : ''}`}
              />
              {generateMutation.isPending ? 'Generating…' : 'Generate for month'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {payoutsQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : payouts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              No payouts recorded for this month yet.
            </p>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              size="sm"
            >
              Generate payouts
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Drivers</p>
                <p className="text-lg font-semibold">{payouts.length}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Owed (pending + approved)</p>
                <p className="text-lg font-semibold">{currency(totalPending)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-lg font-semibold">{currency(totalPaid)}</p>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Safe Miles</TableHead>
                    <TableHead className="text-right">Earned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p: any) => {
                    const name = p.drivers
                      ? `${p.drivers.first_name} ${p.drivers.last_name}`
                      : 'Unknown';
                    const disabled = updateStatusMutation.isPending;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{name}</div>
                          {p.notes && (
                            <div className="text-xs text-muted-foreground">{p.notes}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(p.safe_miles ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {currency(Number(p.earned_amount ?? 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(p.status)} className="capitalize">
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" disabled={disabled}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {p.status !== 'approved' && p.status !== 'paid' && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateStatusMutation.mutate({ id: p.id, status: 'approved' })
                                  }
                                >
                                  Approve
                                </DropdownMenuItem>
                              )}
                              {p.status !== 'paid' && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateStatusMutation.mutate({ id: p.id, status: 'paid' })
                                  }
                                >
                                  Mark Paid
                                </DropdownMenuItem>
                              )}
                              {p.status !== 'pending' && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateStatusMutation.mutate({ id: p.id, status: 'pending' })
                                  }
                                >
                                  Reset to Pending
                                </DropdownMenuItem>
                              )}
                              {p.status !== 'void' && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateStatusMutation.mutate({ id: p.id, status: 'void' })
                                  }
                                  className="text-destructive"
                                >
                                  Void
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SafetyBonusPayouts;
