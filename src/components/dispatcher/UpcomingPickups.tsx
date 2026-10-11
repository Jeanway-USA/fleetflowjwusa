import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Panel } from '@/components/finance/statement-ui';
import { cityState } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from 'lucide-react';
import { format, formatDistanceToNow, addHours, isBefore } from 'date-fns';
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
      const nowDate = format(now, 'yyyy-MM-dd');
      const futureDate = format(in48Hours, 'yyyy-MM-dd');
      
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
        .is('deleted_at', null)
        .in('status', ['pending', 'booked', 'assigned'])
        .gte('pickup_date', nowDate)
        .lte('pickup_date', futureDate)
        .order('pickup_date', { ascending: true });
      
      if (error) throw error;
      return data as UpcomingLoad[];
    },
  });

  const missing = (load: UpcomingLoad) => [!load.driver_id ? 'a driver' : null, !load.truck_id ? 'a truck' : null].filter(Boolean) as string[];
  const isUrgent = (load: UpcomingLoad) => {
    if (!load.pickup_date) return false;
    return isBefore(parsePickupDate(load.pickup_date), addHours(new Date(), 6));
  };
  const count = loads?.length ?? 0;

  return (
    <Panel
      title="Next 48 hours"
      description={isLoading ? 'Loading…' : count === 0 ? 'No pickups scheduled.' : `${count} ${count === 1 ? 'pickup' : 'pickups'} coming up.`}
      flush
      aside={<Button variant="outline" className="h-11" onClick={() => navigate('/fleet-loads')}>All loads</Button>}
    >
      {isLoading ? (
        <div className="space-y-2 border-t p-4">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : count === 0 ? (
        <div className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
          <Calendar className="mx-auto mb-2 h-8 w-8 opacity-50" />
          No pickups scheduled in the next 48 hours.
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y overflow-y-auto border-t">
          {loads!.map((load) => {
            const lacks = missing(load);
            return (
              <li key={load.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/fleet-loads?highlight=${load.id}`)}
                  className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-condensed text-lg font-bold leading-tight">{load.landstar_load_id || `#${load.id.slice(0, 8)}`}</span>
                    {load.pickup_date && (
                      <span className={`text-[13px] ${isUrgent(load) ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                        {formatDistanceToNow(parsePickupDate(load.pickup_date), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-medium">{cityState(load.origin) || load.origin} to {cityState(load.destination) || load.destination}</div>
                  {load.pickup_date && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                      <StopTime utcIso={load.pickup_at} tz={load.pickup_tz} legacyDate={load.pickup_date} legacyTime={load.pickup_time} legacyEndTime={load.pickup_end_time} withDate />
                      {load.pickup_time && <TimeTypeBadge timeType={load.pickup_time_type} time={load.pickup_time} endTime={load.pickup_end_time} variant="compact" />}
                    </div>
                  )}
                  <div className={`mt-1 text-[13px] ${lacks.length > 0 ? 'font-medium text-warning' : 'text-muted-foreground'}`}>
                    {lacks.length > 0
                      ? `Still needs ${lacks.join(' and ')}`
                      : `${load.driver?.first_name} ${load.driver?.last_name}, truck ${load.truck?.unit_number}`}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
