import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, MapPin, User, Truck, Eye, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ActiveLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  pickup_date: string | null;
  delivery_date: string | null;
  rate: number | null;
  booked_miles: number | null;
  agency_code: string | null;
  driver: { first_name: string; last_name: string } | null;
  truck: { unit_number: string } | null;
}

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  loading: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  in_transit: 'bg-green-500/10 text-green-500 border-green-500/20',
  unloading: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

export function ActiveLoadsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
          delivery_date,
          rate,
          booked_miles,
          agency_code,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name),
          truck:trucks!fleet_loads_truck_id_fkey(unit_number)
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fleet_loads' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Active Loads
            </CardTitle>
            <CardDescription>
              {loads?.length || 0} loads in pipeline
            </CardDescription>
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
                <div
                  key={load.id}
                  className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {load.landstar_load_id || load.id.slice(0, 8)}
                        </span>
                        <Badge variant="outline" className={statusColors[load.status] || ''}>
                          {load.status.replace('_', ' ')}
                        </Badge>
                        {rpm && (
                          <span className="text-xs text-muted-foreground">${rpm}/mi</span>
                        )}
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
                          <span>
                            {load.driver 
                              ? `${load.driver.first_name} ${load.driver.last_name}`
                              : 'Unassigned'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          <span>{load.truck?.unit_number || 'No truck'}</span>
                        </div>
                        {load.agency_code && (
                          <span className="text-xs">Agent: {load.agency_code}</span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate('/fleet-loads')}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {(load.pickup_date || load.delivery_date) && (
                    <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                      {load.pickup_date && (
                        <span>Pickup: {format(new Date(load.pickup_date), 'MMM d')}</span>
                      )}
                      {load.delivery_date && (
                        <span>Delivery: {format(new Date(load.delivery_date), 'MMM d')}</span>
                      )}
                      {load.rate && (
                        <span className="ml-auto font-medium text-foreground">${load.rate.toLocaleString()}</span>
                      )}
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
  );
}
