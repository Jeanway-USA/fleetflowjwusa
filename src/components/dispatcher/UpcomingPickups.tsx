import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, AlertTriangle, Clock, User, Truck } from 'lucide-react';
import { format, formatDistanceToNow, addHours, isBefore } from 'date-fns';
import { TimeTypeBadge } from '@/components/shared/TimeTypeBadge';
import { useNavigate } from 'react-router-dom';

interface UpcomingLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_time_type: string | null;
  driver_id: string | null;
  truck_id: string | null;
  driver: { first_name: string; last_name: string } | null;
  truck: { unit_number: string } | null;
}

// Parse date-only strings as local timezone (not UTC)
const parsePickupDate = (dateStr: string) => {
  if (!dateStr.includes('T')) return new Date(dateStr + 'T00:00:00');
  return new Date(dateStr);
};

export function UpcomingPickups() {
  const navigate = useNavigate();

  const { data: loads, isLoading } = useQuery({
    queryKey: ['upcoming-pickups-dispatcher'],
    queryFn: async () => {
      const now = new Date();
      const in48Hours = addHours(now, 48);
      const nowDate = now.toISOString().split('T')[0];
      const futureDate = in48Hours.toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('fleet_loads')
        .select(`
          id,
          landstar_load_id,
          origin,
          destination,
          status,
          pickup_date,
          driver_id,
          truck_id,
          driver:drivers!fleet_loads_driver_id_fkey(first_name, last_name),
          truck:trucks!fleet_loads_truck_id_fkey(unit_number)
        `)
        .in('status', ['pending', 'booked', 'assigned'])
        .gte('pickup_date', nowDate)
        .lte('pickup_date', futureDate)
        .order('pickup_date', { ascending: true });
      
      if (error) throw error;
      return data as UpcomingLoad[];
    },
  });

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Upcoming Pickups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const needsAttention = (load: UpcomingLoad) => !load.driver_id || !load.truck_id;
  const isUrgent = (load: UpcomingLoad) => {
    if (!load.pickup_date) return false;
    return isBefore(parsePickupDate(load.pickup_date), addHours(new Date(), 6));
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Upcoming Pickups
            </CardTitle>
            <CardDescription>Next 48 hours • {loads?.length || 0} scheduled</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/fleet-loads')}>
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loads && loads.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {loads.map((load) => (
              <div
                key={load.id}
                className={`p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                  needsAttention(load)
                    ? 'border-warning bg-warning/5'
                    : isUrgent(load)
                    ? 'border-destructive/50 bg-destructive/5'
                    : 'border-border bg-muted/30'
                }`}
                onClick={() => navigate('/fleet-loads')}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm">
                    {load.landstar_load_id || load.id.slice(0, 8)}
                  </span>
                  {needsAttention(load) && (
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Needs Assignment
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{load.origin}</span>
                </div>
                
                {load.pickup_date && (
                  <div className="flex items-center gap-1 mt-2 text-xs">
                    <Clock className={`h-3 w-3 ${isUrgent(load) ? 'text-destructive' : 'text-muted-foreground'}`} />
                    <span className={isUrgent(load) ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      {formatDistanceToNow(parsePickupDate(load.pickup_date), { addSuffix: true })}
                    </span>
                    <span className="text-muted-foreground">
                      ({format(parsePickupDate(load.pickup_date), 'MMM d, h:mm a')})
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className={!load.driver ? 'text-warning' : ''}>
                      {load.driver 
                        ? `${load.driver.first_name} ${load.driver.last_name.charAt(0)}.`
                        : 'No driver'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    <span className={!load.truck ? 'text-warning' : ''}>
                      {load.truck?.unit_number || 'No truck'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No pickups scheduled in the next 48 hours</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
