import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, MapPin, Truck, Eye, MoreHorizontal, Calendar, DollarSign, Route, ChevronDown, ShieldAlert, ExternalLink, CheckCircle2, Archive } from 'lucide-react';
import { StopTime } from '@/components/shared/StopTime';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useNavigate } from 'react-router-dom';
const LoadRouteMap = lazy(() =>
  import('@/components/driver/LoadRouteMap').then(m => ({ default: m.LoadRouteMap })),
);
import { MapSkeleton } from '@/components/shared/LazyFallbacks';
import { IntermediateStopsView } from '@/components/loads/IntermediateStopsView';
import { Panel } from '@/components/finance/statement-ui';
import { Roster, RosterBulkBar, type RosterEntry } from '@/components/fleet/Roster';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useLoadDiscrepancies } from '@/hooks/useSettlementDiscrepancies';
import { StatementDiscrepancyPanel } from '@/components/finance/StatementDiscrepancyPanel';
import { cityState } from '@/lib/formatters';
import { GROUP_LABELS, OPEN_STATUSES, dispatchGroup, type DispatchGroup } from '@/lib/dispatch';
import { format, parseISO } from 'date-fns';

function LoadDiscrepancyPanel({ loadId }: { loadId: string }) {
  const { data } = useLoadDiscrepancies(loadId);
  if (!data || data.length === 0) return null;
  return <StatementDiscrepancyPanel discrepancies={data} title="Statement Discrepancies" canResolve />;
}

interface ActiveLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  driver_id: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_end_time?: string | null;
  pickup_time_type: string | null;
  pickup_at?: string | null;
  pickup_tz?: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  delivery_end_time?: string | null;
  delivery_time_type: string | null;
  delivery_at?: string | null;
  delivery_tz?: string | null;
  rate: number | null;
  booked_miles: number | null;
  empty_miles: number | null;
  notes: string | null;
  agency_code: string | null;
  driver: { first_name: string; last_name: string } | null;
  truck: { unit_number: string } | null;
  load_accessorials: { amount: number }[] | null;
  has_statement_discrepancy?: boolean | null;
}

const detailStatusColors: Record<string, string> = {
  pending: 'bg-amber-500',
  assigned: 'bg-blue-500',
  loading: 'bg-purple-500',
  in_transit: 'bg-emerald-500',
  delivered: 'bg-success',
  cancelled: 'bg-destructive',
};

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'assigned': return 'Assigned';
    case 'loading': return 'Loading';
    case 'in_transit': return 'In Transit';
    case 'delivered': return 'Delivered';
    default: return status.replace(/_/g, ' ');
  }
}

function formatSpecialInstructions(notes: string | null): React.ReactNode {
  if (!notes) return null;
  const updatedFromRCMatch = notes.split(/---\s*Updated from Rate Confirmation\s*---/i);
  const mainContent = updatedFromRCMatch[0]?.trim() || '';
  const stopsMatch = mainContent.match(/===\s*INTERMEDIATE STOPS\s*===\n?([\s\S]*?)$/i);
  const intermediateStops = stopsMatch?.[1]?.trim();
  const mainInstructions = stopsMatch
    ? mainContent.replace(/===\s*INTERMEDIATE STOPS\s*===[\s\S]*$/i, '').trim()
    : mainContent;

  return (
    <div className="space-y-2">
      {mainInstructions && (
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{mainInstructions}</p>
      )}
      {intermediateStops && (
        <div className="border-t border-warning/30 pt-2 mt-2">
          <p className="text-xs font-semibold text-warning mb-1">Intermediate stops</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{intermediateStops}</p>
        </div>
      )}
    </div>
  );
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/** The statuses a dispatcher moves a load through by hand. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'at_pickup', label: 'At pickup' },
  { value: 'loading', label: 'Loading' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'at_delivery', label: 'At delivery' },
  { value: 'unloading', label: 'Unloading' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const GROUP_ORDER: DispatchGroup[] = ['past_due', 'no_driver', 'on_road', 'upcoming'];
const todayIso = () => format(new Date(), 'yyyy-MM-dd');

export function ActiveLoadsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLoad, setSelectedLoad] = useState<ActiveLoad | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: loads, isLoading } = useQuery({
    queryKey: ['active-loads-dispatcher'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select(`
          id,
          landstar_load_id,
          origin,
          destination,
          status,
          driver_id,
          pickup_date,
          pickup_time,
          pickup_end_time,
          pickup_at,
          pickup_tz,
          delivery_date,
          delivery_time,
          delivery_end_time,
          delivery_at,
          delivery_tz,
          rate,
          booked_miles,
          empty_miles,
          notes,
          agency_code,
          pickup_time_type,
          delivery_time_type,
          has_statement_discrepancy,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name),
          truck:trucks!fleet_loads_truck_id_fkey(unit_number),
          load_accessorials(amount)
        `)
        .is('deleted_at', null)
        .in('status', [...OPEN_STATUSES])
        .order('pickup_date', { ascending: true });

      if (error) throw error;
      return data as ActiveLoad[];
    },
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('active-loads-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fleet_loads' }, () => {
          queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
        })
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription unavailable:', err);
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
    queryClient.invalidateQueries({ queryKey: ['dispatcher-stats'] });
    queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
  };

  const statusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase.from('fleet_loads').update({ status }).in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count, vars) => {
      const label = STATUS_OPTIONS.find((s) => s.value === vars.status)?.label ?? vars.status;
      refresh();
      toast.success(`${count} ${count === 1 ? 'load' : 'loads'} set to ${label}`);
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast.error(err.message || 'Could not change the status'),
  });

  const archive = async (id: string) => {
    const { archiveWithUndo } = await import('@/lib/soft-delete');
    await archiveWithUndo({ table: 'fleet_loads', id, queryClient, invalidateKeys: [['active-loads-dispatcher'], ['dispatcher-stats'], ['fleet_loads']] });
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const today = todayIso();
  const grouped = new Map<DispatchGroup, ActiveLoad[]>();
  for (const load of loads ?? []) {
    const group = dispatchGroup(load, today);
    (grouped.get(group) ?? grouped.set(group, []).get(group)!).push(load);
  }
  // Past-due loads list oldest first, so the longest-overdue is at the top.
  grouped.get('past_due')?.sort((a, b) => (a.delivery_date ?? '').localeCompare(b.delivery_date ?? ''));

  const entryFor = (load: ActiveLoad, group: DispatchGroup): RosterEntry => {
    const loadId = load.landstar_load_id || `#${load.id.slice(0, 8)}`;
    const rpm = load.rate && load.booked_miles && load.booked_miles > 0 ? load.rate / load.booked_miles : null;
    const driverName = load.driver ? `${load.driver.first_name} ${load.driver.last_name}` : null;
    return {
      id: load.id,
      title: loadId,
      onOpen: () => { setSelectedLoad(load); setDetailsOpen(true); },
      chips: (
        <>
          <StatusBadge status={load.status} />
          {group === 'past_due' && load.delivery_date && (
            <span className="rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              Past due since {format(parseISO(load.delivery_date), 'MMM d')}
            </span>
          )}
          {load.has_statement_discrepancy && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              <ShieldAlert className="h-3 w-3" /> Statement mismatch
            </span>
          )}
        </>
      ),
      subtitle: <span className="font-medium text-foreground">{cityState(load.origin) || load.origin} to {cityState(load.destination) || load.destination}</span>,
      facts: [
        {
          label: 'Driver',
          value: driverName ? `${driverName}${load.truck?.unit_number ? `, truck ${load.truck.unit_number}` : ''}` : <span className="font-normal text-destructive">Unassigned</span>,
        },
        {
          label: 'Pickup',
          value: load.pickup_at || load.pickup_date
            ? <StopTime utcIso={load.pickup_at} tz={load.pickup_tz} legacyDate={load.pickup_date} legacyTime={load.pickup_time} legacyEndTime={load.pickup_end_time} withDate />
            : <span className="font-normal text-muted-foreground">Not set</span>,
        },
        {
          label: 'Delivery',
          value: load.delivery_at || load.delivery_date
            ? <StopTime utcIso={load.delivery_at} tz={load.delivery_tz} legacyDate={load.delivery_date} legacyTime={load.delivery_time} legacyEndTime={load.delivery_end_time} withDate />
            : <span className="font-normal text-muted-foreground">Not set</span>,
        },
        { label: 'Rate', value: load.rate ? `${formatCurrency(load.rate)}${rpm ? `, $${rpm.toFixed(2)}/mi` : ''}` : <span className="font-normal text-muted-foreground">Not set</span> },
      ],
      menu: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for load ${loadId}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setSelectedLoad(load); setDetailsOpen(true); }}><Eye className="mr-2 h-4 w-4" /> View details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/fleet-loads?highlight=${load.id}`)}><ExternalLink className="mr-2 h-4 w-4" /> Open on the Loads page</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => statusMutation.mutate({ ids: [load.id], status: 'delivered' })}><CheckCircle2 className="mr-2 h-4 w-4" /> Mark delivered</DropdownMenuItem>
            {STATUS_OPTIONS.filter((s) => s.value !== 'delivered' && s.value !== load.status).map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => statusMutation.mutate({ ids: [load.id], status: s.value })}>Set to {s.label.toLowerCase()}</DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => archive(load.id)}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };
  };

  const total = loads?.length ?? 0;

  return (
    <>
      <Panel
        title="Open loads"
        description={isLoading ? 'Loading…' : total === 0 ? 'Nothing open right now.' : `${total} ${total === 1 ? 'load' : 'loads'} not yet delivered, most urgent first.`}
        flush
        aside={<Button variant="outline" className="h-11" onClick={() => navigate('/fleet-loads')}>All loads</Button>}
      >
        <div className="px-4">
          <RosterBulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11" disabled={statusMutation.isPending}>
                  Change status <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUS_OPTIONS.map((s) => (
                  <DropdownMenuItem key={s.value} onClick={() => statusMutation.mutate({ ids: [...selectedIds], status: s.value })}>{s.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </RosterBulkBar>
        </div>

        {isLoading ? (
          <div className="space-y-3 border-t p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : total === 0 ? (
          <div className="border-t px-4 py-10 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No open loads. New loads show up here as soon as they are booked.
          </div>
        ) : (
          GROUP_ORDER.filter((g) => (grouped.get(g)?.length ?? 0) > 0).map((g) => (
            <section key={g} className="border-t">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pt-3">
                <h4 className={`font-condensed text-lg font-bold ${g === 'past_due' ? 'text-destructive' : ''}`}>
                  {GROUP_LABELS[g].title} <span className="text-muted-foreground">({grouped.get(g)!.length})</span>
                </h4>
                <p className="text-[13px] text-muted-foreground">{GROUP_LABELS[g].hint}</p>
              </div>
              <Roster bordered={false} entries={grouped.get(g)!.map((l) => entryFor(l, g))} selectedIds={selectedIds} onToggle={toggleSelect} />
            </section>
          ))
        )}
      </Panel>

      {/* Unified Load Details Dialog — matches Driver Dashboard */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedLoad && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Load #{selectedLoad.landstar_load_id || 'N/A'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Status */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className={`${detailStatusColors[selectedLoad.status] || 'bg-muted'} text-white`}>
                    {getStatusLabel(selectedLoad.status)}
                  </Badge>
                </div>

                <LoadDiscrepancyPanel loadId={selectedLoad.id} />

                {/* Origin */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-success" />
                    Pickup
                  </div>
                  <p className="font-medium pl-6">{selectedLoad.origin}</p>
                  {(selectedLoad.pickup_at || selectedLoad.pickup_date) && (
                    <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1 flex-wrap">
                      <Calendar className="h-3 w-3" />
                      Pickup:{' '}
                      <StopTime
                        utcIso={selectedLoad.pickup_at}
                        tz={selectedLoad.pickup_tz}
                        legacyDate={selectedLoad.pickup_date}
                        legacyTime={selectedLoad.pickup_time}
                        legacyEndTime={selectedLoad.pickup_end_time}
                        withDate
                        className="font-medium text-foreground"
                      />
                    </p>
                  )}
                </div>

                {/* Destination */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-destructive" />
                    Destination
                  </div>
                  <p className="font-medium pl-6">{selectedLoad.destination}</p>
                  {(selectedLoad.delivery_at || selectedLoad.delivery_date) && (
                    <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1 flex-wrap">
                      <Calendar className="h-3 w-3" />
                      Delivery:{' '}
                      <StopTime
                        utcIso={selectedLoad.delivery_at}
                        tz={selectedLoad.delivery_tz}
                        legacyDate={selectedLoad.delivery_date}
                        legacyTime={selectedLoad.delivery_time}
                        legacyEndTime={selectedLoad.delivery_end_time}
                        withDate
                        className="font-medium text-foreground"
                      />
                    </p>
                  )}
                </div>

                {/* Route Map */}
                <Suspense fallback={<MapSkeleton height={220} />}>
                  <LoadRouteMap origin={selectedLoad.origin} destination={selectedLoad.destination} notes={selectedLoad.notes} />
                </Suspense>

                {/* Miles */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Booked Miles</span>
                  </div>
                  <span className="font-semibold">{selectedLoad.booked_miles?.toLocaleString() || 'TBD'}</span>
                </div>

                {/* Rate */}
                {selectedLoad.rate && (
                  <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Rate</span>
                    </div>
                    <span className="font-bold text-primary text-lg">{formatCurrency(selectedLoad.rate)}</span>
                  </div>
                )}

                {/* Special Instructions */}
                {selectedLoad.notes && (
                  <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                    <p className="text-xs text-warning font-medium uppercase tracking-wide mb-2">Special Instructions</p>
                    <div className="max-h-40 overflow-y-auto pr-3">
                      {formatSpecialInstructions(selectedLoad.notes)}
                    </div>
                    <p className="text-xs text-warning/60 mt-1 italic">Scroll for more ↓</p>
                  </div>
                )}

                {/* Structured intermediate stops with HOS tracking */}
                <IntermediateStopsView loadId={selectedLoad.id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
