import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarRange, ChevronLeft, ChevronRight, GripVertical, Package, MapPin, AlertTriangle, Home } from 'lucide-react';
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

const LOAD_COLORS = [
  'bg-primary/80 text-primary-foreground',
  'bg-accent/80 text-accent-foreground',
  'bg-secondary/80 text-secondary-foreground',
];

function getLoadColor(index: number) {
  return LOAD_COLORS[index % LOAD_COLORS.length];
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
  const [weekOffset, setWeekOffset] = useState(0);
  const [draggedLoad, setDraggedLoad] = useState<TimelineLoad | null>(null);
  const [assigningLoad, setAssigningLoad] = useState<string | null>(null);

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
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date, driver_id')
        .not('driver_id', 'is', null)
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading', 'booked'])
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
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date, driver_id')
        .is('driver_id', null)
        .in('status', ['pending', 'booked'])
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

  const handleDrop = async (driverId: string, e: React.DragEvent) => {
    const load = resolveDroppedLoad(e);
    if (!load) return;

    const { hasConflict, message } = checkConflicts(driverId, load);
    if (hasConflict) {
      toast.warning('Schedule Conflict', { description: message, icon: <AlertTriangle className="h-4 w-4" /> });
      setDraggedLoad(null);
      return;
    }

    setAssigningLoad(load.id);
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ driver_id: driverId, status: 'assigned' })
        .eq('id', load.id);

      if (error) throw error;

      const driver = drivers?.find(d => d.id === driverId);
      toast.success(`Assigned to ${driver?.first_name} ${driver?.last_name}`);

      queryClient.invalidateQueries({ queryKey: ['timeline-assigned-loads'] });
      queryClient.invalidateQueries({ queryKey: ['timeline-unassigned-loads'] });
      queryClient.invalidateQueries({ queryKey: ['dispatcher-stats'] });
      queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-pickups-dispatcher'] });
    } catch {
      toast.error('Failed to assign load');
    } finally {
      setAssigningLoad(null);
      setDraggedLoad(null);
    }
  };

  const isLoading = driversLoading;

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" />
            Fleet Timeline · 14 Days
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(o => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setWeekOffset(0)}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(o => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-muted-foreground">
            {format(windowStart, 'MMM d')} — {format(windowEnd, 'MMM d, yyyy')}
          </p>
          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-sm bg-primary/70" /> Active Transit
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-3 rounded-sm ${HOMETIME_STRIPE}`} /> Pre-Approved Hometime
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-sm bg-amber-400/40 border border-dashed border-amber-500" /> Outbound Planning
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-sm bg-muted" /> Unassigned / Idle
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            {/* Timeline Grid */}
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[1080px]"
                style={{
                  gridTemplateColumns: `140px repeat(${WINDOW_DAYS}, minmax(56px, 1fr))`,
                }}
              >
                {/* Header row */}
                <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border">Driver</div>
                {days.map(day => (
                  <div
                    key={day.toISOString()}
                    className={`p-2 text-center text-xs font-medium border-b border-border ${
                      isSameDay(day, new Date()) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <div>{format(day, 'EEE')}</div>
                    <div className="text-[10px]">{format(day, 'M/d')}</div>
                  </div>
                ))}

                {/* Driver rows */}
                {drivers?.map(driver => {
                  const driverLoads = getLoadsForDriver(driver.id);
                  const hometimeWindows = getHometimeForDriver(driver.id);
                  const outbound = getOutboundPlanning(driver.id);

                  return (
                    <div key={driver.id} className="contents">
                      {/* Driver label */}
                      <div className="p-2 text-sm font-medium border-b border-border truncate flex items-center gap-1.5">
                        <span className="truncate">
                          {driver.first_name} {driver.last_name?.charAt(0)}.
                        </span>
                        {hometimeWindows.some(h => {
                          const s = parseDate(h.start_date);
                          const e = parseDate(h.end_date);
                          return s && e && new Date() >= s && new Date() <= e;
                        }) && <Home className="h-3 w-3 text-purple-500 shrink-0" />}
                      </div>

                      {/* Day cells */}
                      {days.map((day, dayIdx) => {
                        const onHometime = isDayOnHometime(driver.id, day);
                        const onLoad = isDayOnLoad(driver.id, day);
                        const outboundHit =
                          outbound && dayIdx + 2 >= outbound.startCol && dayIdx + 2 < outbound.startCol + outbound.span;

                        return (
                          <div
                            key={day.toISOString()}
                            onDragOver={onHometime ? undefined : handleDragOver}
                            onDrop={onHometime ? undefined : (e) => handleDrop(driver.id, e)}
                            className={[
                              'relative border-b border-l border-border min-h-[44px] transition-colors',
                              onHometime
                                ? `${HOMETIME_STRIPE} pointer-events-none`
                                : onLoad
                                ? 'bg-primary/5'
                                : outboundHit
                                ? 'bg-amber-100/30 dark:bg-amber-900/10'
                                : '',
                              draggedLoad && !onHometime ? 'hover:bg-primary/10' : '',
                              isSameDay(day, new Date()) && !onHometime ? 'bg-primary/5' : '',
                            ].join(' ')}
                          >
                            {/* Outbound planning chip on first day of the window */}
                            {outbound && dayIdx + 2 === outbound.startCol && (
                              <div
                                className="absolute inset-y-1 left-0.5 right-0.5 flex items-center rounded border border-dashed border-amber-500/70 bg-amber-100/50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-[9px] px-1 font-medium truncate z-[5] pointer-events-none"
                                style={{ width: `calc(${outbound.span * 100}% - 4px)` }}
                                title={`Outbound planning window — pre-book reload near ${outbound.region}`}
                              >
                                <MapPin className="h-2.5 w-2.5 mr-0.5 shrink-0" />
                                Reload {outbound.region}
                              </div>
                            )}

                            {/* Load bars starting on this day */}
                            {driverLoads.map((load, loadIdx) => {
                              const pickup = parseDate(load.pickup_date);
                              if (!pickup) return null;
                              if (!isSameDay(pickup, day) && !(dayIdx === 0 && pickup < day)) return null;
                              if (dayIdx > 0 && pickup < day) return null;

                              const delivery = parseDate(load.delivery_date) || pickup;
                              const spanDays = Math.min(
                                differenceInDays(delivery, day) + 1,
                                WINDOW_DAYS - dayIdx
                              );
                              const widthPercent = spanDays * 100;

                              return (
                                <div
                                  key={load.id}
                                  className={`absolute inset-y-0.5 left-0.5 right-0.5 rounded text-[10px] px-1.5 py-0.5 truncate flex items-center font-medium z-10 ${getLoadColor(loadIdx)}`}
                                  style={{ width: `calc(${widthPercent}% - 4px)`, minWidth: 'calc(100% - 4px)' }}
                                  title={`${load.landstar_load_id || load.id.slice(0, 8)}: ${load.origin} → ${load.destination}`}
                                >
                                  {load.landstar_load_id || load.id.slice(0, 6)}
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
                  <div className="col-span-full text-center py-6 text-sm text-muted-foreground">
                    No active drivers
                  </div>
                )}
              </div>
            </div>

            {/* Unassigned Loads Tray (hidden when external drawer is used) */}
            {!hideUnassignedTray && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Unassigned Loads — drag onto a driver row ({unassignedLoads?.length || 0})
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassignedLoads && unassignedLoads.length > 0 ? (
                    unassignedLoads.map(load => (
                      <div
                        key={load.id}
                        draggable
                        onDragStart={() => handleDragStart(load)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-1.5 p-2 rounded-md border border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors text-xs ${
                          draggedLoad?.id === load.id ? 'opacity-50 ring-2 ring-primary' : ''
                        } ${assigningLoad === load.id ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                        <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium">{load.landstar_load_id || load.id.slice(0, 8)}</span>
                        <span className="text-muted-foreground hidden sm:inline">
                          <MapPin className="h-2.5 w-2.5 inline" /> {load.origin?.split(',')[0]} → {load.destination?.split(',')[0]}
                        </span>
                        {load.pickup_date && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {format(parseISO(load.pickup_date), 'M/d')}
                          </Badge>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">No unassigned loads</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
