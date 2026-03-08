import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarRange, ChevronLeft, ChevronRight, GripVertical, Package, MapPin, AlertTriangle } from 'lucide-react';
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

const LOAD_COLORS = [
  'bg-primary/80 text-primary-foreground',
  'bg-accent/80 text-accent-foreground',
  'bg-secondary/80 text-secondary-foreground',
];

function getLoadColor(index: number) {
  return LOAD_COLORS[index % LOAD_COLORS.length];
}

export function FleetTimelineScheduler() {
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [draggedLoad, setDraggedLoad] = useState<TimelineLoad | null>(null);
  const [assigningLoad, setAssigningLoad] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfDay(addDays(new Date(), weekOffset * 7)), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = days[6];

  // Active drivers with their truck assignments
  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ['timeline-drivers'],
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

  // Loads in the 7-day window (assigned)
  const { data: assignedLoads } = useQuery({
    queryKey: ['timeline-assigned-loads', weekStart.toISOString()],
    queryFn: async () => {
      const windowStart = weekStart.toISOString().split('T')[0];
      const windowEnd = format(addDays(weekEnd, 1), 'yyyy-MM-dd');

      const { data } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, status, pickup_date, delivery_date, driver_id')
        .not('driver_id', 'is', null)
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading', 'booked'])
        .or(`pickup_date.lte.${windowEnd},delivery_date.gte.${windowStart},and(pickup_date.gte.${windowStart},pickup_date.lte.${windowEnd})`);

      return (data || []) as TimelineLoad[];
    },
  });

  // Unassigned loads
  const { data: unassignedLoads } = useQuery({
    queryKey: ['timeline-unassigned-loads'],
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

  // Service schedules for conflict detection
  const { data: serviceSchedules } = useQuery({
    queryKey: ['timeline-service-schedules'],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_schedules')
        .select('id, truck_id, service_name, last_performed_date, interval_days');

      return (data || []) as ServiceSchedule[];
    },
  });

  const getLoadsForDriver = (driverId: string) =>
    assignedLoads?.filter(l => l.driver_id === driverId) || [];

  const getLoadBarStyle = (load: TimelineLoad) => {
    if (!load.pickup_date) return null;
    const pickup = startOfDay(parseISO(load.pickup_date));
    const delivery = load.delivery_date ? startOfDay(parseISO(load.delivery_date)) : pickup;

    const startCol = Math.max(0, differenceInDays(pickup, weekStart));
    const endCol = Math.min(6, differenceInDays(delivery, weekStart));

    if (startCol > 6 || endCol < 0) return null;

    const colStart = Math.max(startCol, 0) + 2; // +2 because col 1 is the driver label
    const colSpan = Math.max(1, endCol - Math.max(startCol, 0) + 1);

    return { gridColumn: `${colStart} / span ${colSpan}` };
  };

  const checkConflicts = (driverId: string, load: TimelineLoad): { hasConflict: boolean; message: string } => {
    if (!load.pickup_date) return { hasConflict: false, message: '' };

    const newStart = startOfDay(parseISO(load.pickup_date));
    const newEnd = load.delivery_date ? startOfDay(parseISO(load.delivery_date)) : newStart;

    // Check load overlaps
    const driverLoads = getLoadsForDriver(driverId);
    const loadOverlap = driverLoads.some(existing => {
      if (!existing.pickup_date) return false;
      const existStart = startOfDay(parseISO(existing.pickup_date));
      const existEnd = existing.delivery_date ? startOfDay(parseISO(existing.delivery_date)) : existStart;
      return newStart <= existEnd && newEnd >= existStart;
    });

    if (loadOverlap) {
      return { hasConflict: true, message: 'This load overlaps with an existing assignment for this driver.' };
    }

    // Check PM schedule conflicts
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

  const handleDrop = async (driverId: string) => {
    if (!draggedLoad) return;

    const { hasConflict, message } = checkConflicts(driverId, draggedLoad);
    if (hasConflict) {
      toast.warning('Schedule Conflict', { description: message, icon: <AlertTriangle className="h-4 w-4" /> });
      setDraggedLoad(null);
      return;
    }

    setAssigningLoad(draggedLoad.id);
    try {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ driver_id: driverId, status: 'assigned' })
        .eq('id', draggedLoad.id);

      if (error) throw error;

      const driver = drivers?.find(d => d.id === driverId);
      toast.success(`Assigned to ${driver?.first_name} ${driver?.last_name}`);

      queryClient.invalidateQueries({ queryKey: ['timeline-assigned-loads'] });
      queryClient.invalidateQueries({ queryKey: ['timeline-unassigned-loads'] });
      queryClient.invalidateQueries({ queryKey: ['dispatcher-stats'] });
      queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
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
            Fleet Timeline
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
        <p className="text-xs text-muted-foreground">
          {format(weekStart, 'MMM d')} — {format(weekEnd, 'MMM d, yyyy')}
        </p>
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
                className="grid min-w-[600px]"
                style={{
                  gridTemplateColumns: '120px repeat(7, 1fr)',
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

                  return (
                    <div
                      key={driver.id}
                      className="contents"
                    >
                      {/* Driver label */}
                      <div className="p-2 text-sm font-medium border-b border-border truncate flex items-center">
                        {driver.first_name} {driver.last_name?.charAt(0)}.
                      </div>

                      {/* Day cells as a single drop zone row */}
                      {days.map((day, dayIdx) => (
                        <div
                          key={day.toISOString()}
                          onDragOver={handleDragOver}
                          onDrop={() => handleDrop(driver.id)}
                          className={`relative border-b border-l border-border min-h-[44px] transition-colors ${
                            draggedLoad ? 'bg-primary/5 hover:bg-primary/10' : ''
                          } ${isSameDay(day, new Date()) ? 'bg-primary/5' : ''}`}
                        >
                          {/* Render load bars that start on this day */}
                          {driverLoads.map((load, loadIdx) => {
                            if (!load.pickup_date) return null;
                            const pickup = startOfDay(parseISO(load.pickup_date));
                            if (!isSameDay(pickup, day) && !(dayIdx === 0 && pickup < day)) return null;
                            if (dayIdx > 0 && pickup < day) return null; // only render from start col

                            const delivery = load.delivery_date ? startOfDay(parseISO(load.delivery_date)) : pickup;
                            const spanDays = Math.min(
                              differenceInDays(delivery, day) + 1,
                              7 - dayIdx
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
                      ))}
                    </div>
                  );
                })}

                {(!drivers || drivers.length === 0) && (
                  <div className="col-span-8 text-center py-6 text-sm text-muted-foreground">
                    No active drivers
                  </div>
                )}
              </div>
            </div>

            {/* Unassigned Loads Tray */}
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
