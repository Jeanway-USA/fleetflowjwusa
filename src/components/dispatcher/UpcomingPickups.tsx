import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, AlertTriangle, Clock, User, Truck } from 'lucide-react';
import { formatDistanceToNow, addHours, isBefore } from 'date-fns';
import { TimeTypeBadge } from '@/components/shared/TimeTypeBadge';
import { StopTime } from '@/components/shared/StopTime';
import { useNavigate } from 'react-router-dom';

interface UpcomingLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_end_time?: string | null;
  pickup_time_type: string | null;
  pickup_at?: string | null;
  pickup_tz?: string | null;
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
    staleTime: 2 * 60 * 1000,
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
          pickup_time,
          pickup_end_time,
          pickup_time_type,
          pickup_at,
          pickup_tz,
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
          <div className="space-y-2">
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              Upcoming Pickups
            </CardTitle>
            <CardDescription className="text-xs">
              Next 48 hours • {loads?.length || 0} scheduled
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs shrink-0"
            onClick={() => navigate('/fleet-loads')}
          >
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loads && loads.length > 0 ? (
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {loads.map((load) => (
              <div
                key={load.id}
                className={`p-2.5 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                  needsAttention(load)
                    ? 'border-warning bg-warning/5'
                    : isUrgent(load)
                    ? 'border-destructive/50 bg-destructive/5'
                    : 'border-border bg-muted/30'
                }`}
                onClick={() => navigate(`/fleet-loads?loadId=${load.id}`)}
              >
                {/* Line 1: load number + relative time */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {needsAttention(load) && (
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-warning shrink-0"
                        aria-label="Needs assignment"
                      />
                    )}
                    {load.landstar_load_id || load.id.slice(0, 8)}
                  </span>
                  {load.pickup_date && (
                    <span
                      className={`text-[11px] shrink-0 ${
                        isUrgent(load) ? 'text-destructive font-medium' : 'text-muted-foreground'
                      }`}
                    >
                      {formatDistanceToNow(parsePickupDate(load.pickup_date), { addSuffix: true })}
                    </span>
                  )}
                </div>

                {/* Line 2: origin → destination */}
                <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 min-w-0" title={load.origin || ''}>
                    <MapPin className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                    <span className="truncate">{load.origin || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1 min-w-0" title={load.destination || ''}>
                    <MapPin className="h-2.5 w-2.5 text-red-500 shrink-0" />
                    <span className="truncate">{load.destination || '—'}</span>
                  </div>
                </div>

                {/* Line 3: absolute stop time */}
                {load.pickup_date && (
                  <div className="mt-1.5 flex items-center flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                    <Clock
                      className={`h-3 w-3 shrink-0 ${
                        isUrgent(load) ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    />
                    <StopTime
                      utcIso={load.pickup_at}
                      tz={load.pickup_tz}
                      legacyDate={load.pickup_date}
                      legacyTime={load.pickup_time}
                      legacyEndTime={load.pickup_end_time}
                      withDate
                    />
                    {load.pickup_time && (
                      <TimeTypeBadge
                        timeType={load.pickup_time_type}
                        time={load.pickup_time}
                        endTime={load.pickup_end_time}
                        variant="compact"
                      />
                    )}
                  </div>
                )}

                {/* Line 4: driver + truck */}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <User className="h-3 w-3 shrink-0" />
                    <span className={`truncate ${!load.driver ? 'text-warning' : ''}`}>
                      {load.driver
                        ? `${load.driver.first_name} ${load.driver.last_name.charAt(0)}.`
                        : 'No driver'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 min-w-0">
                    <Truck className="h-3 w-3 shrink-0" />
                    <span className={`truncate ${!load.truck ? 'text-warning' : ''}`}>
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
            <p className="text-sm">No pickups scheduled in the next 48 hours</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
