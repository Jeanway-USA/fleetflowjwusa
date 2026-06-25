import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, MapPin, User, Truck, Eye, MoreHorizontal, Calendar, DollarSign, Route, Pencil, Trash2, LayoutGrid, Table as TableIcon, ChevronDown, ShieldAlert } from 'lucide-react';
import { TimeTypeBadge } from '@/components/shared/TimeTypeBadge';
import { StopTime } from '@/components/shared/StopTime';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
const LoadRouteMap = lazy(() =>
  import('@/components/driver/LoadRouteMap').then(m => ({ default: m.LoadRouteMap })),
);
import { MapSkeleton } from '@/components/shared/LazyFallbacks';
import { DataTable } from '@/components/shared/DataTable';
import { IntermediateStopsView } from '@/components/loads/IntermediateStopsView';
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
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_time_type: string | null;
  pickup_at?: string | null;
  pickup_tz?: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
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

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  loading: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  in_transit: 'bg-green-500/10 text-green-500 border-green-500/20',
  unloading: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

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
    default: return status.replace('_', ' ');
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
          <p className="text-xs font-semibold text-warning mb-1">📍 Intermediate Stops</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{intermediateStops}</p>
        </div>
      )}
    </div>
  );
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'loading', label: 'Loading' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'unloading', label: 'Unloading' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function ActiveLoadsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLoad, setSelectedLoad] = useState<ActiveLoad | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [view, setView] = useState<'cards' | 'table'>('cards');
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
          pickup_date,
          pickup_time,
          pickup_at,
          pickup_tz,
          delivery_date,
          delivery_time,
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
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading', 'pending'])
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

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase.from('fleet_loads').update({ status }).in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count, vars) => {
      const label = STATUS_OPTIONS.find(s => s.value === vars.status)?.label ?? vars.status;
      queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
      toast.success(`Updated ${count} load${count !== 1 ? 's' : ''} to ${label}`);
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update statuses'),
  });


  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Active Loads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="card-elevated h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Active Loads
              </CardTitle>
              <CardDescription>{loads?.length || 0} loads in pipeline</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                <Button
                  variant={view === 'cards' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setView('cards')}
                  aria-pressed={view === 'cards'}
                  aria-label="Card view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={view === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setView('table')}
                  aria-pressed={view === 'table'}
                  aria-label="Table view"
                >
                  <TableIcon className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/fleet-loads')}>
                View All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === 'table' ? (
            <DataTable<ActiveLoad>
              tableId="active-loads-dispatcher"
              data={loads || []}
              emptyMessage="No active loads"
              emptyIcon={Package}
              onRowClick={(load) => { setSelectedLoad(load); setDetailsOpen(true); }}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              bulkActions={(ids) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-8" disabled={bulkStatusMutation.isPending}>
                      Change Status
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {STATUS_OPTIONS.map(s => (
                      <DropdownMenuItem
                        key={s.value}
                        onClick={() => bulkStatusMutation.mutate({ ids: Array.from(ids), status: s.value })}
                      >
                        {s.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              columns={[
                {
                  key: 'landstar_load_id',
                  header: 'Load #',
                  width: '12%',
                  render: (l) => (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">{l.landstar_load_id || l.id.slice(0, 8)}</span>
                      {l.has_statement_discrepancy && (
                        <Badge variant="destructive" className="gap-1 h-5 px-1.5 text-[10px]">
                          <ShieldAlert className="h-3 w-3" />
                          MISMATCH
                        </Badge>
                      )}
                    </span>
                  ),
                  filter: { type: 'text', accessor: (l) => l.landstar_load_id || l.id },
                },
                {
                  key: 'origin',
                  header: 'Origin',
                  width: '16%',
                  render: (l) => <span className="truncate">{l.origin}</span>,
                  filter: { type: 'text', accessor: (l) => l.origin },
                },
                {
                  key: 'destination',
                  header: 'Destination',
                  width: '16%',
                  render: (l) => <span className="truncate">{l.destination}</span>,
                  filter: { type: 'text', accessor: (l) => l.destination },
                },
                {
                  key: 'driver',
                  header: 'Driver',
                  width: '14%',
                  hiddenOnMobile: true,
                  render: (l) => l.driver ? `${l.driver.first_name} ${l.driver.last_name}` : <span className="text-muted-foreground">Unassigned</span>,
                  filter: { type: 'text', accessor: (l) => l.driver ? `${l.driver.first_name} ${l.driver.last_name}` : '' },
                },
                {
                  key: 'truck',
                  header: 'Truck',
                  width: '8%',
                  hiddenOnMobile: true,
                  render: (l) => l.truck?.unit_number || <span className="text-muted-foreground">—</span>,
                },
                {
                  key: 'pickup_date',
                  header: 'Pickup',
                  width: '12%',
                  render: (l) => (l.pickup_at || l.pickup_date)
                    ? <StopTime utcIso={l.pickup_at} tz={l.pickup_tz} legacyDate={l.pickup_date} legacyTime={l.pickup_time} dateOnly />
                    : '—',
                  filter: { type: 'date-range', accessor: (l) => l.pickup_date },
                },
                {
                  key: 'status',
                  header: 'Status',
                  width: '12%',
                  render: (l) => (
                    <Badge variant="outline" className={statusColors[l.status] || ''}>
                      {l.status.replace('_', ' ')}
                    </Badge>
                  ),
                  filter: { type: 'text', accessor: (l) => l.status },
                },
                {
                  key: 'rate',
                  header: 'Rate',
                  width: '10%',
                  render: (l) => l.rate ? <span className="font-medium">${l.rate.toLocaleString()}</span> : '—',
                },
              ]}
            />
          ) : (
            <>
            {loads && loads.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {loads.map((load) => {
                const rpm = load.rate && load.booked_miles && load.booked_miles > 0
                  ? (load.rate / load.booked_miles).toFixed(2)
                  : null;

                return (
                  <div key={load.id} className={`p-3 rounded-lg border ${load.has_statement_discrepancy ? 'border-destructive bg-destructive/5' : 'border-border bg-muted/30'} hover:bg-muted/50 transition-colors`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{load.landstar_load_id || load.id.slice(0, 8)}</span>
                          <Badge variant="outline" className={statusColors[load.status] || ''}>{load.status.replace('_', ' ')}</Badge>
                          {load.has_statement_discrepancy && (
                            <Badge variant="destructive" className="gap-1 animate-pulse">
                              <ShieldAlert className="h-3 w-3" />
                              STATEMENT MISMATCH
                            </Badge>
                          )}
                          {rpm && <span className="text-xs text-muted-foreground">${rpm}/mi</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{load.origin}</span>
                          <span className="mx-1">→</span>
                          <span className="truncate">{load.destination}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{load.driver ? `${load.driver.first_name} ${load.driver.last_name}` : 'Unassigned'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            <span>{load.truck?.unit_number || 'No truck'}</span>
                          </div>
                          {load.agency_code && <span className="text-xs">Agent: {load.agency_code}</span>}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setSelectedLoad(load); setDetailsOpen(true); }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate('/fleet-loads')}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => { /* TODO: wire delete */ }}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {(load.pickup_at || load.pickup_date || load.delivery_at || load.delivery_date) && (
                      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border text-xs text-muted-foreground flex-wrap">
                        {(load.pickup_at || load.pickup_date) && (
                          <span className="inline-flex items-center gap-1 flex-wrap">
                            Pickup:{' '}
                            <StopTime
                              utcIso={load.pickup_at}
                              tz={load.pickup_tz}
                              legacyDate={load.pickup_date}
                              legacyTime={load.pickup_time}
                              withDate
                            />
                            {load.pickup_time && <TimeTypeBadge timeType={load.pickup_time_type} time={load.pickup_time} variant="compact" />}
                          </span>
                        )}
                        {(load.delivery_at || load.delivery_date) && (
                          <span className="inline-flex items-center gap-1 flex-wrap">
                            Delivery:{' '}
                            <StopTime
                              utcIso={load.delivery_at}
                              tz={load.delivery_tz}
                              legacyDate={load.delivery_date}
                              legacyTime={load.delivery_time}
                              withDate
                            />
                            {load.delivery_time && <TimeTypeBadge timeType={load.delivery_time_type} time={load.delivery_time} variant="compact" />}
                          </span>
                        )}
                        {load.rate && <span className="ml-auto font-medium text-foreground">${load.rate.toLocaleString()}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active loads at the moment</p>
            </div>
          )}
            </>
          )}
        </CardContent>
      </Card>

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
                    Origin
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
                    <p className="text-[10px] text-warning/60 mt-1 italic">Scroll for more ↓</p>
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
