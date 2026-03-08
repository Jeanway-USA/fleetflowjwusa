import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, MapPin, User, Truck, Eye, MoreHorizontal, Calendar, DollarSign, Route, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { LoadRouteMap } from '@/components/driver/LoadRouteMap';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface ActiveLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  pickup_date: string | null;
  pickup_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  rate: number | null;
  booked_miles: number | null;
  empty_miles: number | null;
  notes: string | null;
  agency_code: string | null;
  driver: { first_name: string; last_name: string } | null;
  truck: { unit_number: string } | null;
  load_accessorials: { amount: number }[] | null;
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

export function ActiveLoadsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLoad, setSelectedLoad] = useState<ActiveLoad | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
          delivery_date,
          delivery_time,
          rate,
          booked_miles,
          empty_miles,
          notes,
          agency_code,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name),
          truck:trucks!fleet_loads_truck_id_fkey(unit_number),
          load_accessorials(amount)
        `)
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading', 'pending'])
        .order('pickup_date', { ascending: true });

      if (error) throw error;
      return data as ActiveLoad[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('active-loads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fleet_loads' }, () => {
        queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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
            <Button variant="outline" size="sm" onClick={() => navigate('/fleet-loads')}>
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loads && loads.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {loads.map((load) => {
                const rpm = load.rate && load.booked_miles && load.booked_miles > 0
                  ? (load.rate / load.booked_miles).toFixed(2)
                  : null;

                return (
                  <div key={load.id} className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{load.landstar_load_id || load.id.slice(0, 8)}</span>
                          <Badge variant="outline" className={statusColors[load.status] || ''}>{load.status.replace('_', ' ')}</Badge>
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {(load.pickup_date || load.delivery_date) && (
                      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                        {load.pickup_date && <span>Pickup: {format(new Date(load.pickup_date), 'MMM d')}</span>}
                        {load.delivery_date && <span>Delivery: {format(new Date(load.delivery_date), 'MMM d')}</span>}
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

                {/* Origin */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-success" />
                    Origin
                  </div>
                  <p className="font-medium pl-6">{selectedLoad.origin}</p>
                  {selectedLoad.pickup_date && (
                    <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Pickup: {format(parseISO(selectedLoad.pickup_date), 'EEE, MMM d, yyyy')}
                      {selectedLoad.pickup_time && <span className="font-medium text-foreground ml-1">@ {selectedLoad.pickup_time}</span>}
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
                  {selectedLoad.delivery_date && (
                    <p className="text-sm text-muted-foreground pl-6 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Delivery: {format(parseISO(selectedLoad.delivery_date), 'EEE, MMM d, yyyy')}
                      {selectedLoad.delivery_time && <span className="font-medium text-foreground ml-1">@ {selectedLoad.delivery_time}</span>}
                    </p>
                  )}
                </div>

                {/* Route Map */}
                <LoadRouteMap origin={selectedLoad.origin} destination={selectedLoad.destination} notes={selectedLoad.notes} />

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
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
