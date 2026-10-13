import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Panel } from '@/components/finance/statement-ui';
import { GripVertical, Inbox, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { cityState } from '@/lib/formatters';
import { OPEN_STATUSES } from '@/lib/dispatch';

interface UnassignedLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  pickup_date: string | null;
  delivery_date: string | null;
  driver_id: string | null;
  booked_miles: number | null;
}

interface PickableDriver {
  id: string;
  first_name: string;
  last_name: string;
}

/** Two loads overlap when each starts on or before the day the other ends. */
const overlaps = (a: { pickup_date: string | null; delivery_date: string | null }, b: { pickup_date: string | null; delivery_date: string | null }) => {
  if (!a.pickup_date || !b.pickup_date) return false;
  const aEnd = a.delivery_date || a.pickup_date;
  const bEnd = b.delivery_date || b.pickup_date;
  return a.pickup_date <= bEnd && b.pickup_date <= aEnd;
};

function LoadRow({ load, drivers }: { load: UnassignedLoad; drivers: PickableDriver[] }) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const onDragStart = (e: React.DragEvent<HTMLLIElement>) => {
    setDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-load-id', load.id);
    e.dataTransfer.setData('application/x-load-json', JSON.stringify(load));
    // Fallback plain text (some browsers require it)
    e.dataTransfer.setData('text/plain', load.landstar_load_id || load.id);
  };

  const assign = async (driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    setBusy(true);
    try {
      // Refuse to double-book: look at the driver's other open loads for the same days.
      const { data: theirs, error: theirsError } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, pickup_date, delivery_date')
        .eq('driver_id', driverId)
        .is('deleted_at', null)
        .in('status', [...OPEN_STATUSES]);
      if (theirsError) throw theirsError;
      const clash = (theirs ?? []).find((t) => t.id !== load.id && overlaps(t, load));
      if (clash) {
        toast.warning(`${driver?.first_name ?? 'That driver'} already has load ${clash.landstar_load_id ?? ''} on those days`, {
          description: 'Pick another driver, or move one of the loads first.',
        });
        return;
      }
      const { error } = await supabase.from('fleet_loads').update({ driver_id: driverId, status: 'assigned' }).eq('id', load.id);
      if (error) throw error;
      toast.success(`Load ${load.landstar_load_id ?? ''} assigned to ${driver?.first_name} ${driver?.last_name}`);
      for (const key of ['timeline-unassigned-loads', 'timeline-assigned-loads', 'active-loads-dispatcher', 'dispatcher-stats', 'upcoming-pickups-dispatcher', 'fleet_loads']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not assign the load');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => setDragging(false)}
      className={`group px-4 py-3 transition-colors ${dragging ? 'bg-primary/10' : ''}`}
      title="Pick a driver below, or drag this onto a driver row on the timeline"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-1 hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground group-hover:text-primary sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-condensed text-lg font-bold leading-tight">{load.landstar_load_id || `#${load.id.slice(0, 8)}`}</span>
            {load.pickup_date && <span className="text-[13px] tabular-nums text-muted-foreground">Picks up {format(parseISO(load.pickup_date), 'EEE, MMM d')}</span>}
          </div>
          <div className="text-[13px] font-medium">{cityState(load.origin) || load.origin} to {cityState(load.destination) || load.destination}</div>
          <div className="mt-2">
            <Select disabled={busy || drivers.length === 0} onValueChange={assign}>
              <SelectTrigger className="h-11" aria-label={`Assign load ${load.landstar_load_id ?? ''} to a driver`}>
                <SelectValue placeholder={drivers.length === 0 ? 'No active drivers' : 'Assign to a driver'} />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </li>
  );
}

function LoadList({ loads, isLoading, drivers }: { loads: UnassignedLoad[] | undefined; isLoading: boolean; drivers: PickableDriver[] }) {
  if (isLoading) {
    return <div className="space-y-2 border-t p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  if (!loads || loads.length === 0) {
    return (
      <div className="border-t px-4 py-10 text-center text-muted-foreground">
        <Check className="mx-auto mb-2 h-8 w-8 text-success opacity-80" />
        <p className="text-sm font-medium">Every load has a driver</p>
        <p className="mt-1 text-xs">Anything booked without one will show up here.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y border-t">
      {loads.map((load) => (
        <LoadRow key={load.id} load={load} drivers={drivers} />
      ))}
    </ul>
  );
}

export function UnassignedLoadsDrawer() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const { data: loads, isLoading } = useQuery({
    queryKey: ['timeline-unassigned-loads'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date, driver_id, booked_miles')
        .is('driver_id', null)
        .is('deleted_at', null)
        .in('status', ['pending', 'booked', 'assigned'])
        .order('pickup_date', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as UnassignedLoad[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-pickable'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers_public_view').select('id, first_name, last_name').eq('status', 'active').order('first_name');
      if (error) throw error;
      return (data || []) as PickableDriver[];
    },
  });

  const count = loads?.length ?? 0;

  if (isMobile) {
    return (
      <div id="assign-driver" className="scroll-mt-20">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 w-full justify-between gap-2">
              <span className="flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Loads needing a driver
              </span>
              <span className="figure font-semibold">{count}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex h-[80vh] flex-col">
            <SheetHeader>
              <SheetTitle>Loads needing a driver ({count})</SheetTitle>
            </SheetHeader>
            <div className="mt-2 flex-1 overflow-y-auto">
              <LoadList loads={loads} isLoading={isLoading} drivers={drivers} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div id="assign-driver" className="scroll-mt-20">
      <Panel title="Needs a driver" description={isLoading ? 'Loading…' : count === 0 ? 'Nothing waiting.' : `${count} ${count === 1 ? 'load' : 'loads'} booked with nobody assigned.`} flush>
        <div className="max-h-[560px] overflow-y-auto">
          <LoadList loads={loads} isLoading={isLoading} drivers={drivers} />
        </div>
      </Panel>
    </div>
  );
}
