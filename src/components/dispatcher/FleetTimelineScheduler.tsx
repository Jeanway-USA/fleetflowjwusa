import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Panel } from '@/components/finance/statement-ui';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { cityState } from '@/lib/formatters';
import { isPastDue, ON_ROAD_STATUSES } from '@/lib/dispatch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, GripVertical, Package, MapPin, AlertTriangle, Home } from 'lucide-react';
import { format, addDays, startOfDay, isSameDay, isWithinInterval, parseISO, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

interface TimelineDriver {
  id: string;
  first_name: string;
  last_name: string;
  truckId: string | null;
}

interface TimelineLoad {
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

interface ServiceSchedule {
  id: string;
  truck_id: string;
  service_name: string;
  last_performed_date: string | null;
  interval_days: number | null;
}

interface HometimeWindow {
  driver_id: string;
  start_date: string;
  end_date: string;
}

const WINDOW_DAYS = 14;
const MILES_PER_DAY = 500;

/** A bar's colour says what the load is doing: late, on the road, or waiting to start. */
function barClass(load: { status: string; delivery_date: string | null }, today: string) {
  if (isPastDue(load, today)) return 'bg-destructive text-destructive-foreground';
  if ((ON_ROAD_STATUSES as readonly string[]).includes(load.status)) return 'bg-primary text-primary-foreground';
  return 'bg-primary/35 text-foreground border border-primary/40';
}

// Diagonal striping used to lock hometime cells.
const HOMETIME_STRIPE =
  'bg-[image:repeating-linear-gradient(45deg,hsl(var(--muted-foreground)/0.18)_0_6px,transparent_6px_12px)] bg-purple-500/10 dark:bg-purple-400/10';

function parseDate(d: string | null | undefined) {
  if (!d) return null;
  return startOfDay(parseISO(`${d.slice(0, 10)}T00:00:00`));
}

function destinationRegion(destination: string | null | undefined) {
  if (!destination) return '';
  const parts = destination.split(',').map(s => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || destination;
}

interface FleetTimelineSchedulerProps {
  hideUnassignedTray?: boolean;
}

export function FleetTimelineScheduler({ hideUnassignedTray = false }: FleetTimelineSchedulerProps = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [weekOffset, setWeekOffset] = useState(0);
  const [draggedLoad, setDraggedLoad] = useState<TimelineLoad | null>(null);
  const [assigningLoad, setAssigningLoad] = useState<string | null>(null);

  // Ref to a day header cell — used to measure day-column pixel width for resize math.
  const dayCellRef = useRef<HTMLDivElement | null>(null);

  // Live resize state — while active, previewDates override the DB values for that load.
  const [resizing, setResizing] = useState<{
    loadId: string;
    driverId: string;
    edge: 'left' | 'right';
    originX: number;
    originPickup: Date;
    originDelivery: Date;
  } | null>(null);
  const [previewDates, setPreviewDates] = useState<{ pickup: Date; delivery: Date } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const windowStart = useMemo(
    () => startOfDay(addDays(new Date(), weekOffset * 7)),
    [weekOffset]
  );
  const days = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i)),
    [windowStart]
  );
  const windowEnd = days[WINDOW_DAYS - 1];
  const windowStartIso = format(windowStart, 'yyyy-MM-dd');
  const windowEndIso = format(windowEnd, 'yyyy-MM-dd');

  // Active drivers with their truck assignments
  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ['timeline-drivers'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: driverRows } = await supabase
        .from('drivers_public_view')
        .select('id, first_name, last_name')
        .eq('status', 'active');

      const { data: trucks } = await supabase
        .from('trucks')
        .select('id, current_driver_id')
        .eq('status', 'active');

      const truckMap = new Map(trucks?.map(t => [t.current_driver_id, t.id]) || []);

      return (driverRows || []).map(d => ({
        ...d,
        truckId: truckMap.get(d.id) || null,
      })) as TimelineDriver[];
    },
  });

  // Loads intersecting the window (assigned)
  const { data: assignedLoads } = useQuery({
    queryKey: ['timeline-assigned-loads', windowStartIso, windowEndIso],
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date, driver_id, booked_miles')
        .not('driver_id', 'is', null)
        .is('deleted_at', null)
        .in('status', ['assigned', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading', 'booked'])
        .or(`pickup_date.lte.${windowEndIso},delivery_date.gte.${windowStartIso},and(pickup_date.gte.${windowStartIso},pickup_date.lte.${windowEndIso})`);

      return (data || []) as TimelineLoad[];
    },
  });

  // Unassigned loads
  const { data: unassignedLoads } = useQuery({
    queryKey: ['timeline-unassigned-loads'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date, driver_id, booked_miles')
        .is('driver_id', null)
        .is('deleted_at', null)
        .in('status', ['pending', 'booked', 'assigned'])
        .order('pickup_date', { ascending: true })
        .limit(20);

      return (data || []) as TimelineLoad[];
    },
  });

  // Approved hometime windows overlapping the visible range
  const { data: hometime } = useQuery({
    queryKey: ['timeline-hometime', windowStartIso, windowEndIso],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('driver_requests')
        .select('driver_id, start_date, end_date, request_type, status')
        .eq('request_type', 'home_time')
        .eq('status', 'approved')
        .not('start_date', 'is', null)
        .not('end_date', 'is', null)
        .gte('end_date', windowStartIso)
        .lte('start_date', windowEndIso);

      return (data || []) as HometimeWindow[];
    },
  });

  // Service schedules for conflict detection
  const { data: serviceSchedules } = useQuery({
    queryKey: ['timeline-service-schedules'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('service_schedules')
        .select('id, truck_id, service_name, last_performed_date, interval_days');

      return (data || []) as ServiceSchedule[];
    },
  });

  const getLoadsForDriver = (driverId: string) =>
    assignedLoads?.filter(l => l.driver_id === driverId) || [];

  const getHometimeForDriver = (driverId: string) =>
    hometime?.filter(h => h.driver_id === driverId) || [];

  const isDayOnHometime = (driverId: string, day: Date) => {
    return getHometimeForDriver(driverId).some(h => {
      const s = parseDate(h.start_date);
      const e = parseDate(h.end_date);
      if (!s || !e) return false;
      return day >= s && day <= e;
    });
  };

  const isDayOnLoad = (driverId: string, day: Date) => {
    return getLoadsForDriver(driverId).some(l => {
      const s = parseDate(l.pickup_date);
      const e = parseDate(l.delivery_date) || s;
      if (!s || !e) return false;
      return day >= s && day <= e;
    });
  };

  /**
   * Outbound planning window: 1–3 days immediately after the last delivery
   * inside the visible range, when those days are free of loads and hometime.
   */
  const getOutboundPlanning = (driverId: string) => {
    const loads = getLoadsForDriver(driverId);
    if (loads.length === 0) return null;
    // Find last-delivering load whose delivery_date is inside the window
    const scored = loads
      .map(l => {
        const d = parseDate(l.delivery_date);
        return d ? { load: l, delivery: d } : null;
      })
      .filter((x): x is { load: TimelineLoad; delivery: Date } => !!x)
      .filter(x => x.delivery >= windowStart && x.delivery <= windowEnd)
      .sort((a, b) => b.delivery.getTime() - a.delivery.getTime());

    const last = scored[0];
    if (!last) return null;

    const gapDays: Date[] = [];
    for (let i = 1; i <= 3; i++) {
      const day = addDays(last.delivery, i);
      if (day > windowEnd) break;
      if (isDayOnHometime(driverId, day)) break;
      if (isDayOnLoad(driverId, day)) break;
      gapDays.push(day);
    }
    if (gapDays.length === 0) return null;
    return {
      startCol: differenceInDays(gapDays[0], windowStart) + 2, // +2 for label col
      span: gapDays.length,
      region: destinationRegion(last.load.destination),
    };
  };

  const checkConflicts = (driverId: string, load: TimelineLoad): { hasConflict: boolean; message: string } => {
    if (!load.pickup_date) return { hasConflict: false, message: '' };

    const newStart = parseDate(load.pickup_date)!;
    const newEnd = parseDate(load.delivery_date) || newStart;

    // Hometime lock
    const hometimeOverlap = getHometimeForDriver(driverId).find(h => {
      const s = parseDate(h.start_date);
      const e = parseDate(h.end_date);
      if (!s || !e) return false;
      return newStart <= e && newEnd >= s;
    });
    if (hometimeOverlap) {
      return {
        hasConflict: true,
        message: `Driver has approved hometime ${format(parseDate(hometimeOverlap.start_date)!, 'MMM d')}–${format(parseDate(hometimeOverlap.end_date)!, 'MMM d')}. Move or reschedule the hometime first.`,
      };
    }

    // Load overlaps
    const driverLoads = getLoadsForDriver(driverId);
    const loadOverlap = driverLoads.some(existing => {
      if (!existing.pickup_date) return false;
      const existStart = parseDate(existing.pickup_date)!;
      const existEnd = parseDate(existing.delivery_date) || existStart;
      return newStart <= existEnd && newEnd >= existStart;
    });

    if (loadOverlap) {
      return { hasConflict: true, message: 'This load overlaps with an existing assignment for this driver.' };
    }

    // PM schedule conflicts
    const driver = drivers?.find(d => d.id === driverId);
    if (driver?.truckId && serviceSchedules) {
      const truckSchedules = serviceSchedules.filter(
        s => s.truck_id === driver.truckId && s.interval_days && s.last_performed_date
      );

      const pmConflict = truckSchedules.some(schedule => {
        if (!schedule.last_performed_date || !schedule.interval_days) return false;
        const nextDue = addDays(parseISO(schedule.last_performed_date), schedule.interval_days);
        return isWithinInterval(nextDue, { start: newStart, end: newEnd });
      });

      if (pmConflict) {
        return { hasConflict: true, message: 'This load conflicts with a scheduled preventive maintenance window.' };
      }
    }

    return { hasConflict: false, message: '' };
  };

  const handleDragStart = (load: TimelineLoad) => setDraggedLoad(load);
  const handleDragEnd = () => setDraggedLoad(null);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const resolveDroppedLoad = (e: React.DragEvent): TimelineLoad | null => {
    if (draggedLoad) return draggedLoad;
    // External drag (from UnassignedLoadsDrawer)
    try {
      const json = e.dataTransfer.getData('application/x-load-json');
      if (json) return JSON.parse(json) as TimelineLoad;
    } catch {
      /* fall through */
    }
    const id = e.dataTransfer.getData('application/x-load-id');
    if (!id) return null;
    const match = unassignedLoads?.find(l => l.id === id);
    return match || null;
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['timeline-assigned-loads'] });
    queryClient.invalidateQueries({ queryKey: ['timeline-unassigned-loads'] });
    queryClient.invalidateQueries({ queryKey: ['dispatcher-stats'] });
    queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
    queryClient.invalidateQueries({ queryKey: ['upcoming-pickups-dispatcher'] });
  };

  const handleDrop = async (driverId: string, dayIdx: number, e: React.DragEvent) => {
    const load = resolveDroppedLoad(e);
    if (!load) return;

    // Auto-snap: derive span from booked miles (baseline 500 mi/day).
    const miles = load.booked_miles ?? 0;
    const spanDays = Math.max(1, Math.ceil(miles / MILES_PER_DAY));
    const pickup = addDays(windowStart, dayIdx);
    const delivery = addDays(pickup, spanDays - 1);
    const pickupIso = format(pickup, 'yyyy-MM-dd');
    const deliveryIso = format(delivery, 'yyyy-MM-dd');

    const snapped: TimelineLoad = {
      ...load,
      pickup_date: pickupIso,
      delivery_date: deliveryIso,
    };

    const { hasConflict, message } = checkConflicts(driverId, snapped);
    if (hasConflict) {
      toast.warning('Schedule Conflict', { description: message, icon: <AlertTriangle className="h-4 w-4" /> });
      setDraggedLoad(null);
      return;
    }

    setAssigningLoad(load.id);
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({
          driver_id: driverId,
          status: 'assigned',
          pickup_date: pickupIso,
          delivery_date: deliveryIso,
        })
        .eq('id', load.id);

      if (error) throw error;

      const driver = drivers?.find(d => d.id === driverId);
      toast.success(
        `Assigned to ${driver?.first_name} ${driver?.last_name}`,
        { description: `${format(pickup, 'MMM d')} → ${format(delivery, 'MMM d')} · ${spanDays} day${spanDays > 1 ? 's' : ''} @ ${MILES_PER_DAY} mi/day` }
      );

      invalidateAll();
    } catch {
      toast.error('Failed to assign load');
    } finally {
      setAssigningLoad(null);
      setDraggedLoad(null);
    }
  };

  // ------- Resize handlers -------
  const startResize = (
    load: TimelineLoad,
    driverId: string,
    edge: 'left' | 'right',
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const pickup = parseDate(load.pickup_date);
    const delivery = parseDate(load.delivery_date) || pickup;
    if (!pickup || !delivery) return;
    setResizing({
      loadId: load.id,
      driverId,
      edge,
      originX: e.clientX,
      originPickup: pickup,
      originDelivery: delivery,
    });
    setPreviewDates({ pickup, delivery });
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!resizing) return;

    const dayWidth = dayCellRef.current?.getBoundingClientRect().width || 56;

    const onMove = (ev: MouseEvent) => {
      const dxDays = Math.round((ev.clientX - resizing.originX) / dayWidth);
      let pickup = resizing.originPickup;
      let delivery = resizing.originDelivery;

      if (resizing.edge === 'left') {
        pickup = addDays(resizing.originPickup, dxDays);
        if (pickup > delivery) pickup = delivery;
        if (pickup < windowStart) pickup = windowStart;
      } else {
        delivery = addDays(resizing.originDelivery, dxDays);
        if (delivery < pickup) delivery = pickup;
        if (delivery > windowEnd) delivery = windowEnd;
      }

      setPreviewDates({ pickup, delivery });
      setTooltipPos({ x: ev.clientX, y: ev.clientY });
    };

    const onUp = async () => {
      const current = resizing;
      const preview = previewDatesRef.current;
      setResizing(null);
      setTooltipPos(null);

      if (!current || !preview) {
        setPreviewDates(null);
        return;
      }

      const pickupChanged = !isSameDay(preview.pickup, current.originPickup);
      const deliveryChanged = !isSameDay(preview.delivery, current.originDelivery);
      if (!pickupChanged && !deliveryChanged) {
        setPreviewDates(null);
        return;
      }

      const pickupIso = format(preview.pickup, 'yyyy-MM-dd');
      const deliveryIso = format(preview.delivery, 'yyyy-MM-dd');
      const trial: TimelineLoad = {
        id: current.loadId,
        landstar_load_id: null,
        origin: '',
        destination: '',
        status: 'assigned',
        pickup_date: pickupIso,
        delivery_date: deliveryIso,
        driver_id: current.driverId,
        booked_miles: null,
      };

      // Temporarily exclude the load being resized so it doesn't self-conflict.
      const originalLoads = assignedLoads;
      const filteredLoads = (originalLoads || []).filter(l => l.id !== current.loadId);
      // Swap into query cache for the conflict check window.
      queryClient.setQueryData(['timeline-assigned-loads', windowStartIso, windowEndIso], filteredLoads);
      const { hasConflict, message } = checkConflicts(current.driverId, trial);
      queryClient.setQueryData(['timeline-assigned-loads', windowStartIso, windowEndIso], originalLoads);

      if (hasConflict) {
        toast.warning('Resize blocked', { description: message, icon: <AlertTriangle className="h-4 w-4" /> });
        setPreviewDates(null);
        return;
      }

      try {
        const { error } = await supabase
          .from('fleet_loads')
          .update({ pickup_date: pickupIso, delivery_date: deliveryIso })
          .eq('id', current.loadId);
        if (error) throw error;
        toast.success('Load rescheduled', {
          description: `${format(preview.pickup, 'MMM d')} → ${format(preview.delivery, 'MMM d')}`,
        });
        invalidateAll();
      } catch {
        toast.error('Failed to reschedule load');
      } finally {
        setPreviewDates(null);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // Keep a ref of the latest preview dates so the mouseup handler (bound once per resize) sees fresh values.
  const previewDatesRef = useRef(previewDates);
  useEffect(() => {
    previewDatesRef.current = previewDates;
  }, [previewDates]);



  /**
   * Loads that share a day for one driver (a same-day handoff, or a double booking) sit in separate lanes
   * so neither bar covers the other.
   */
  const lanesFor = (driverId: string) => {
    const sorted = getLoadsForDriver(driverId)
      .filter((l) => l.pickup_date)
      .sort((a, b) => (a.pickup_date ?? '').localeCompare(b.pickup_date ?? ''));
    const laneEnds: string[] = [];
    const laneOf = new Map<string, number>();
    for (const l of sorted) {
      const start = (l.pickup_date ?? '').slice(0, 10);
      const end = (l.delivery_date || l.pickup_date || '').slice(0, 10);
      let lane = laneEnds.findIndex((e) => e < start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      laneOf.set(l.id, lane);
    }
    return { laneOf, count: Math.max(1, laneEnds.length) };
  };

  const isLoading = driversLoading;
  const rangeLabel = `${format(windowStart, 'MMM d')} to ${format(windowEnd, 'MMM d, yyyy')}`;

  const controls = (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Back one week" onClick={() => setWeekOffset(o => o - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" className="h-11" onClick={() => setWeekOffset(0)}>Today</Button>
      <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Forward one week" onClick={() => setWeekOffset(o => o + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  const legend = (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-primary" /> On the road</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-primary/40 bg-primary/35" /> Booked, not started</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-destructive" /> Past due</span>
      <span className="flex items-center gap-1.5"><span className={`inline-block h-3 w-4 rounded-sm ${HOMETIME_STRIPE}`} /> Hometime</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-dashed border-amber-500 bg-amber-400/40" /> Free to reload</span>
    </div>
  );

  // On a phone the grid is replaced by one short list per driver.
  const agenda = (
    <div className="divide-y rounded-lg border">
      {(drivers ?? []).map(driver => {
        const mine = getLoadsForDriver(driver.id)
          .filter(l => l.pickup_date)
          .sort((a, b) => (a.pickup_date ?? '').localeCompare(b.pickup_date ?? ''));
        const away = getHometimeForDriver(driver.id);
        return (
          <div key={driver.id} className="px-4 py-3">
            <div className="font-condensed text-lg font-bold leading-tight">{driver.first_name} {driver.last_name}</div>
            {mine.length === 0 && away.length === 0 && <div className="text-[13px] text-muted-foreground">Nothing scheduled in this window.</div>}
            {away.map(h => (
              <div key={h.start_date} className="mt-1 flex items-center gap-1.5 text-[13px] text-purple-600">
                <Home className="h-3.5 w-3.5" /> Hometime {format(parseDate(h.start_date)!, 'MMM d')} to {format(parseDate(h.end_date)!, 'MMM d')}
              </div>
            ))}
            {mine.map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => navigate(`/fleet-loads?highlight=${l.id}`)}
                className={`mt-2 block min-h-11 w-full rounded-md px-3 py-2 text-left text-[13px] ${barClass(l, todayStr)}`}
              >
                <span className="font-semibold">{l.landstar_load_id || l.id.slice(0, 6)}</span>{' '}
                {cityState(l.origin) || l.origin} to {cityState(l.destination) || l.destination}
                <span className="block opacity-90">{format(parseDate(l.pickup_date)!, 'EEE MMM d')}{l.delivery_date ? ` to ${format(parseDate(l.delivery_date)!, 'EEE MMM d')}` : ''}</span>
              </button>
            ))}
          </div>
        );
      })}
      {(!drivers || drivers.length === 0) && <div className="px-4 py-6 text-center text-sm text-muted-foreground">No active drivers yet.</div>}
    </div>
  );

  return (
    <>
      <Panel title="Schedule" description={rangeLabel} aside={controls}>
        {isLoading ? (
          <div className="space-y-2 pb-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            {legend}
            {isMobile ? agenda : (
              <div className="overflow-x-auto pb-2">
                <div
                  className="grid min-w-[1080px]"
                  style={{ gridTemplateColumns: `160px repeat(${WINDOW_DAYS}, minmax(56px, 1fr))` }}
                >
                  {/* Header row */}
                  <div className="border-b border-border p-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Driver</div>
                  {days.map((day, idx) => {
                    const today = isSameDay(day, new Date());
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div
                        key={day.toISOString()}
                        ref={idx === 0 ? dayCellRef : undefined}
                        className={`border-b border-border p-2 text-center text-xs font-medium ${today ? 'bg-primary/15 text-foreground' : weekend ? 'bg-muted/40 text-muted-foreground' : 'text-muted-foreground'}`}
                      >
                        <div className={today ? 'font-bold' : ''}>{today ? 'Today' : format(day, 'EEE')}</div>
                        <div className="text-[11px]">{format(day, 'M/d')}</div>
                      </div>
                    );
                  })}

                  {/* Driver rows */}
                  {drivers?.map(driver => {
                    const driverLoads = getLoadsForDriver(driver.id);
                    const hometimeWindows = getHometimeForDriver(driver.id);
                    const outbound = getOutboundPlanning(driver.id);
                    const { laneOf, count: laneCount } = lanesFor(driver.id);

                    return (
                      <div key={driver.id} className="contents">
                        <div className="flex items-center gap-1.5 truncate border-b border-border p-2 text-sm font-medium">
                          <span className="truncate">{driver.first_name} {driver.last_name}</span>
                          {hometimeWindows.some(h => {
                            const s = parseDate(h.start_date);
                            const e = parseDate(h.end_date);
                            return s && e && new Date() >= s && new Date() <= e;
                          }) && <Home className="h-3 w-3 shrink-0 text-purple-500" aria-label="On hometime" />}
                        </div>

                        {days.map((day, dayIdx) => {
                          const onHometime = isDayOnHometime(driver.id, day);
                          const onLoad = isDayOnLoad(driver.id, day);
                          const today = isSameDay(day, new Date());
                          const outboundHit = outbound && dayIdx + 2 >= outbound.startCol && dayIdx + 2 < outbound.startCol + outbound.span;

                          return (
                            <div
                              key={day.toISOString()}
                              style={{ minHeight: Math.max(48, laneCount * 30 + 8) }}
                              onDragOver={onHometime ? undefined : handleDragOver}
                              onDrop={onHometime ? undefined : (e) => handleDrop(driver.id, dayIdx, e)}
                              className={[
                                'relative border-b border-l border-border transition-colors',
                                onHometime ? `${HOMETIME_STRIPE} pointer-events-none` : onLoad ? 'bg-primary/5' : outboundHit ? 'bg-amber-100/30 dark:bg-amber-900/10' : '',
                                draggedLoad && !onHometime ? 'hover:bg-primary/10' : '',
                                today && !onHometime ? 'bg-primary/10' : '',
                              ].join(' ')}
                            >
                              {outbound && dayIdx + 2 === outbound.startCol && (
                                <div
                                  className="pointer-events-none absolute inset-y-1 left-0.5 right-0.5 z-[5] flex items-center truncate rounded border border-dashed border-amber-500/70 bg-amber-100/50 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                                  style={{ width: `calc(${outbound.span * 100}% - 4px)` }}
                                  title={`Free to reload near ${outbound.region}`}
                                >
                                  <MapPin className="mr-0.5 h-2.5 w-2.5 shrink-0" />
                                  Reload {outbound.region}
                                </div>
                              )}

                              {driverLoads.map((load) => {
                                const isBeingResized = resizing?.loadId === load.id && !!previewDates;
                                const pickup = isBeingResized ? previewDates!.pickup : parseDate(load.pickup_date);
                                if (!pickup) return null;
                                if (!isSameDay(pickup, day) && !(dayIdx === 0 && pickup < day)) return null;
                                if (dayIdx > 0 && pickup < day) return null;

                                const delivery = isBeingResized ? previewDates!.delivery : parseDate(load.delivery_date) || pickup;
                                const spanDays = Math.min(differenceInDays(delivery, day) + 1, WINDOW_DAYS - dayIdx);
                                const widthPercent = spanDays * 100;
                                const late = isPastDue(load, todayStr);

                                return (
                                  <div
                                    key={load.id}
                                    role="link"
                                    tabIndex={0}
                                    onClick={() => navigate(`/fleet-loads?highlight=${load.id}`)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/fleet-loads?highlight=${load.id}`); }}
                                    className={`group/bar absolute left-0.5 right-0.5 z-10 flex overflow-hidden cursor-pointer items-center rounded px-2 py-0.5 text-[11px] font-semibold ${barClass(load, todayStr)} ${isBeingResized ? 'shadow-lg ring-2 ring-primary' : ''}`}
                                    style={{ width: `calc(${widthPercent}% - 4px)`, minWidth: 'calc(100% - 4px)', top: `calc(${((laneOf.get(load.id) ?? 0) * 100) / laneCount}% + 3px)`, height: `calc(${100 / laneCount}% - 6px)` }}
                                    title={`${load.landstar_load_id || load.id.slice(0, 8)}: ${cityState(load.origin) || load.origin} to ${cityState(load.destination) || load.destination}${load.booked_miles ? ` · ${load.booked_miles} mi` : ''}${late ? ' · past due' : ''}. Click to open.`}
                                  >
                                    <div
                                      role="button"
                                      aria-label="Drag to change the pickup day"
                                      onMouseDown={(e) => startResize(load, driver.id, 'left', e)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute bottom-0 left-0 top-0 flex w-2 cursor-w-resize items-center justify-center opacity-40 transition-opacity hover:opacity-100 group-hover/bar:opacity-80"
                                    >
                                      <div className="h-3/5 w-0.5 rounded-full bg-current" />
                                    </div>

                                    <span className="pointer-events-none flex-1 truncate px-1">
                                      {late ? 'Late ' : ''}{load.landstar_load_id || load.id.slice(0, 6)}
                                      {spanDays > 1 && <span className="font-normal opacity-90"> {cityState(load.origin)?.split(',')[0]} to {cityState(load.destination)?.split(',')[0]}</span>}
                                    </span>

                                    <div
                                      role="button"
                                      aria-label="Drag to change the delivery day"
                                      onMouseDown={(e) => startResize(load, driver.id, 'right', e)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute bottom-0 right-0 top-0 flex w-2 cursor-e-resize items-center justify-center opacity-40 transition-opacity hover:opacity-100 group-hover/bar:opacity-80"
                                    >
                                      <div className="h-3/5 w-0.5 rounded-full bg-current" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {(!drivers || drivers.length === 0) && (
                    <div className="col-span-full py-6 text-center text-sm text-muted-foreground">No active drivers yet.</div>
                  )}
                </div>
              </div>
            )}

            {!hideUnassignedTray && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Loads needing a driver, drag onto a driver row ({unassignedLoads?.length || 0})
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassignedLoads && unassignedLoads.length > 0 ? (
                    unassignedLoads.map(load => (
                      <div
                        key={load.id}
                        draggable
                        onDragStart={() => handleDragStart(load)}
                        onDragEnd={handleDragEnd}
                        className={`flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-muted/30 p-2 text-xs transition-colors hover:bg-muted/50 active:cursor-grabbing ${
                          draggedLoad?.id === load.id ? 'opacity-50 ring-2 ring-primary' : ''
                        } ${assigningLoad === load.id ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{load.landstar_load_id || load.id.slice(0, 8)}</span>
                        <span className="hidden text-muted-foreground sm:inline">
                          {cityState(load.origin)} to {cityState(load.destination)}
                        </span>
                        {load.pickup_date && <Badge variant="outline" className="h-4 px-1 text-[10px]">{format(parseISO(load.pickup_date), 'M/d')}</Badge>}
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-xs text-muted-foreground">Every load has a driver.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Floating resize tooltip */}
      {resizing && previewDates && tooltipPos && (
        <div
          className="pointer-events-none fixed z-[9999] rounded border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
        >
          {resizing.edge === 'left' ? 'Pickup: ' : 'Delivery: '}
          {format(resizing.edge === 'left' ? previewDates.pickup : previewDates.delivery, 'EEE, MMM d')}
        </div>
      )}
    </>
  );
}
