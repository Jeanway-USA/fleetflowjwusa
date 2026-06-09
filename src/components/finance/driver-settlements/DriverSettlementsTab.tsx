import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { Users, FileText, ChevronLeft, ChevronRight, MoreHorizontal, CheckCircle2, DollarSign, Receipt } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import type { Database } from '@/integrations/supabase/types';
import { calculateWeeklyPay, type PaySettings } from '@/utils/payCalculations';
import { usePaySettings } from '@/hooks/usePaySettings';

type DriverSettlement = Database['public']['Tables']['driver_settlements']['Row'];

type PayType = 'percentage' | 'per_mile' | 'flat' | string;

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  pay_type: PayType | null;
  pay_rate: number | null;
  status: string | null;
}

interface FleetLoad {
  id: string;
  driver_id: string | null;
  status: string | null;
  delivery_date: string | null;
  pickup_date: string | null;
  gross_revenue: number | null;
  net_revenue: number | null;
  rate: number | null;
  fuel_surcharge?: number | null;
  actual_miles: number | null;
  booked_miles: number | null;
  load_accessorials?: Array<{ amount: number | null }> | null;
}

const STATUS_OPTIONS = ['all', 'draft', 'approved', 'paid'] as const;

function driverName(d?: Driver | null) {
  if (!d) return '—';
  return `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || '—';
}

function estimatePay(driver: Driver, loads: FleetLoad[], settings: PaySettings): number {
  return calculateWeeklyPay({
    loads: loads as any,
    driver: { pay_type: driver.pay_type, pay_rate: driver.pay_rate },
    settings,
  }).total;
}

export function DriverSettlementsTab() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const paySettings = usePaySettings();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const periodStart = format(weekStart, 'yyyy-MM-dd');
  const periodEnd = format(weekEnd, 'yyyy-MM-dd');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [generateFor, setGenerateFor] = useState<{ driver: Driver; loads: FleetLoad[] } | null>(null);

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, pay_type, pay_rate, status');
      if (error) throw error;
      return (data ?? []) as Driver[];
    },
  });

  const { data: weekLoads = [] } = useQuery<FleetLoad[]>({
    queryKey: ['fleet_loads_for_week', periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, driver_id, status, delivery_date, pickup_date, gross_revenue, net_revenue, rate, fuel_surcharge, actual_miles, booked_miles, load_accessorials(amount)')
        .eq('status', 'delivered')
        .gte('delivery_date', periodStart)
        .lte('delivery_date', periodEnd);
      if (error) throw error;
      return (data ?? []) as FleetLoad[];
    },
  });

  const { data: settledLoadIds = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ['settled_load_ids', periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlement_items')
        .select('load_id')
        .not('load_id', 'is', null);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.load_id as string));
    },
  });

  const { data: settlements = [], isLoading: settlementsLoading } = useQuery<DriverSettlement[]>({
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

  const pendingRows = useMemo(() => {
    const activeDrivers = drivers.filter((d) => (d.status ?? 'active') === 'active');
    return activeDrivers
      .map((d) => {
        const loads = weekLoads.filter((l) => l.driver_id === d.id && !settledLoadIds.has(l.id));
        if (loads.length === 0) return null;
        const gross = loads.reduce((s, l) => s + Number(l.gross_revenue ?? l.rate ?? 0), 0);
        const est = estimatePay(d, loads, paySettings);
        return { driver: d, loads, gross, est };
      })
      .filter(Boolean) as Array<{ driver: Driver; loads: FleetLoad[]; gross: number; est: number }>;
  }, [drivers, weekLoads, settledLoadIds]);

  const filteredSettlements = useMemo(() => {
    if (statusFilter === 'all') return settlements;
    return settlements.filter((s) => s.status === statusFilter);
  }, [settlements, statusFilter]);

  const driverMap = useMemo(() => {
    const m = new Map<string, Driver>();
    drivers.forEach((d) => m.set(d.id, d));
    return m;
  }, [drivers]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'draft' | 'approved' | 'paid' }) => {
      const patch: Partial<DriverSettlement> = { status };
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
      toast.success('Paystub updated');
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
      qc.invalidateQueries({ queryKey: ['settled_load_ids'] });
      toast.success('Paystub deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Week selector */}
      <Card className="card-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Driver Settlements
            </CardTitle>
            <CardDescription>
              Unified workspace for generating, approving and paying driver paystubs.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium px-2 min-w-[180px] text-center">
              {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
            </div>
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              This week
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Pending */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Pending / Unsettled Drivers
          </CardTitle>
          <CardDescription>
            Drivers with delivered loads this week that have not yet been added to a paystub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Loads</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Est. Pay</TableHead>
                  <TableHead>Pay Type</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No unsettled drivers for this week.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingRows.map(({ driver, loads, gross, est }) => (
                    <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driverName(driver)}</TableCell>
                      <TableCell className="text-right">{loads.length}</TableCell>
                      <TableCell className="text-right">{formatCurrency(gross)}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatCurrency(est)}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {(driver.pay_type || '—').replace('_', ' ')}
                        {driver.pay_rate ? ` · ${driver.pay_type === 'percentage' ? `${driver.pay_rate}%` : `$${driver.pay_rate}`}` : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="gradient-gold text-primary-foreground"
                          onClick={() => setGenerateFor({ driver, loads })}
                        >
                          <Receipt className="h-4 w-4 mr-2" /> Generate Paystub
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Generated paystubs */}
      <Card className="card-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Generated Paystubs
            </CardTitle>
            <CardDescription>All paystubs across drivers and periods.</CardDescription>
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
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlementsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">Loading…</TableCell>
                  </TableRow>
                ) : filteredSettlements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No paystubs match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSettlements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{driverName(driverMap.get(s.driver_id))}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(parseISO(`${s.period_start}T00:00:00`), 'MMM d')} – {format(parseISO(`${s.period_end}T00:00:00`), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(s.base_pay ?? 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(s.bonus_pay ?? 0))}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatCurrency(Number(s.net_pay ?? 0))}</TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {s.status === 'draft' && (
                              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: s.id, status: 'approved' })}>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                              </DropdownMenuItem>
                            )}
                            {s.status === 'approved' && (
                              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: s.id, status: 'paid' })}>
                                <DollarSign className="mr-2 h-4 w-4" /> Mark Paid
                              </DropdownMenuItem>
                            )}
                            {s.status !== 'draft' && (
                              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: s.id, status: 'draft' })}>
                                Revert to Draft
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (confirm('Delete this paystub? This cannot be undone.')) {
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <GeneratePaystubDialog
        open={!!generateFor}
        onClose={() => setGenerateFor(null)}
        driver={generateFor?.driver ?? null}
        loads={generateFor?.loads ?? []}
        periodStart={periodStart}
        periodEnd={periodEnd}
        orgId={orgId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['driver_settlements'] });
          qc.invalidateQueries({ queryKey: ['settled_load_ids'] });
          setGenerateFor(null);
        }}
      />
    </div>
  );
}

function GeneratePaystubDialog({
  open,
  onClose,
  driver,
  loads,
  periodStart,
  periodEnd,
  orgId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  driver: Driver | null;
  loads: FleetLoad[];
  periodStart: string;
  periodEnd: string;
  orgId: string | null | undefined;
  onCreated: () => void;
}) {
  const isFlat = (driver?.pay_type || '').toLowerCase() === 'flat';
  const includedLoads = isFlat ? [] : loads;
  const estimated = driver ? estimatePay(driver, includedLoads) : 0;

  const [basePay, setBasePay] = useState<string>('');
  const [bonusPay, setBonusPay] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');

  // Reset whenever driver changes or dialog opens
  useEffect(() => {
    if (driver && open) {
      setBasePay(estimated.toFixed(2));
      setBonusPay('0');
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.id, open]);

  const base = Number(basePay) || 0;
  const bonus = Number(bonusPay) || 0;
  const net = base + bonus;

  const payTypeLabel = (() => {
    if (!driver) return '';
    const pt = (driver.pay_type || '').toLowerCase();
    const rate = Number(driver.pay_rate ?? 0);
    if (pt === 'flat') return `Flat Rate · ${formatCurrency(rate)}`;
    if (pt === 'percentage') return `Percentage @ ${rate}%`;
    if (pt === 'per_mile') return `Per Mile @ $${rate}`;
    return driver.pay_type || 'Unknown';
  })();

  const submit = async (targetStatus: 'draft' | 'approved') => {
    if (!driver || !orgId) {
      toast.error('Missing driver or organization');
      return;
    }
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from('driver_settlements')
        .insert({
          org_id: orgId,
          driver_id: driver.id,
          period_start: periodStart,
          period_end: periodEnd,
          base_pay: base,
          bonus_pay: bonus,
          deductions: 0,
          status: targetStatus,
          notes: notes || null,
          approved_at: targetStatus === 'approved' ? new Date().toISOString() : null,
          approved_by: targetStatus === 'approved' ? (userRes.user?.id ?? null) : null,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (includedLoads.length > 0) {
        const items = includedLoads.map((l) => ({
          org_id: orgId,
          settlement_id: row.id,
          item_type: 'load',
          load_id: l.id,
          description: 'Load delivery',
          amount: Number(l.gross_revenue ?? l.rate ?? 0),
        }));
        const { error: itemsErr } = await supabase.from('driver_settlement_items').insert(items);
        if (itemsErr) throw itemsErr;
      }

      toast.success(
        targetStatus === 'approved'
          ? 'Paystub approved — driver notified'
          : 'Paystub saved as draft',
      );
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const [savingDraft, setSavingDraft] = useState(false);
  const [approving, setApproving] = useState(false);

  if (!driver) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Generate Paystub — {driverName(driver)}</DialogTitle>
          <DialogDescription>
            {format(parseISO(`${periodStart}T00:00:00`), 'MMM d')} – {format(parseISO(`${periodEnd}T00:00:00`), 'MMM d, yyyy')}
            {' · '}
            {loads.length} load{loads.length === 1 ? '' : 's'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">Pay Type</span>
            <Badge variant="secondary" className="font-medium">{payTypeLabel}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Base Pay ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={basePay}
                onChange={(e) => setBasePay(e.target.value)}
              />
              {isFlat && (
                <p className="text-xs text-muted-foreground">Flat rate — loads ignored.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Bonus Pay ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={bonusPay}
                onChange={(e) => setBonusPay(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">Safety bonus, referral, etc.</p>
            </div>
          </div>

          <div className="flex justify-between items-center bg-primary/10 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium">Net Pay</p>
              <p className="text-xs text-muted-foreground">Base + Bonus</p>
            </div>
            <span className="text-2xl font-bold text-primary">{formatCurrency(net)}</span>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
          </div>

          {!isFlat && includedLoads.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium mb-2">Loads in this paystub</p>
              <ul className="text-sm text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {includedLoads.map((l) => (
                  <li key={l.id} className="flex justify-between">
                    <span>{l.delivery_date ?? l.pickup_date ?? '—'}</span>
                    <span>{formatCurrency(Number(l.gross_revenue ?? l.rate ?? 0))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} className="mr-auto">Cancel</Button>
          <LoadingButton
            variant="outline"
            loading={savingDraft}
            onClick={async () => {
              setSavingDraft(true);
              await submit('draft');
              setSavingDraft(false);
            }}
          >
            Save as Draft
          </LoadingButton>
          <LoadingButton
            className="gradient-gold text-primary-foreground"
            loading={approving}
            onClick={async () => {
              setApproving(true);
              await submit('approved');
              setApproving(false);
            }}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & Send to Driver
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
