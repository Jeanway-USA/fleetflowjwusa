import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { cityState } from '@/lib/formatters';
import { nextStop } from '@/lib/next-stop';

const ACTIVE = ['assigned', 'loading', 'at_pickup', 'in_transit', 'at_delivery', 'unloading'];

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Assigned',
  loading: 'Loading',
  at_pickup: 'At pickup',
  in_transit: 'In transit',
  at_delivery: 'At delivery',
  unloading: 'Unloading',
};

interface ActiveLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string | null;
  destination: string | null;
  status: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
}

interface FleetCounts {
  active: number;
  available: number;
  maintenance: number;
  outOfService: number;
  total: number;
}

/**
 * Phone block for "where is the load": each load in motion with its status and next stop, and the truck count beside
 * the title. Reads the same load statuses the dispatch views treat as committed.
 */
export function ActiveLoadsNow({ fleet, fleetLoading }: { fleet?: FleetCounts; fleetLoading?: boolean }) {
  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['today-active-loads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date')
        .is('deleted_at', null)
        .in('status', ACTIVE)
        .order('delivery_date', { ascending: true })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as ActiveLoad[];
    },
  });

  return (
    <section aria-labelledby="active-now-title" className="rounded-lg border bg-card px-4 pt-3 pb-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="active-now-title" className="font-condensed text-xl font-bold">On the road</h2>
        {!fleetLoading && fleet && (
          <span className="text-sm text-muted-foreground">
            {fleet.active} of {fleet.total} truck{fleet.total === 1 ? '' : 's'} hauling
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3 py-3">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : loads.length === 0 ? (
        <p className="py-4 text-[15px] text-muted-foreground">No load in motion right now.</p>
      ) : (
        <ul className="mt-1 divide-y">
          {loads.map((l) => {
            const stop = nextStop(l);
            return (
              <li key={l.id}>
                <Link to="/fleet-loads" className="-mx-4 flex min-h-[56px] items-center gap-3 px-4 py-2 hover:bg-secondary/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">
                      {cityState(l.origin) || 'Unknown'} <span className="text-muted-foreground">to</span> {cityState(l.destination) || 'Unknown'}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {STATUS_LABEL[l.status ?? ''] ?? l.status}
                      {' · Next: '}{stop.verb} {stop.place}{stop.when ? `, ${stop.when}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
