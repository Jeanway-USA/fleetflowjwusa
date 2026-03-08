import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addDays, format, differenceInDays, parseISO, startOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarDays, List, Truck, AlertTriangle, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectedService {
  truckId: string;
  unitNumber: string;
  make: string;
  serviceName: string;
  projectedDate: Date;
  remainingMiles: number;
  avgDailyMiles: number;
  confidence: 'high' | 'medium' | 'low';
  urgency: 'overdue' | 'soon' | 'upcoming' | 'normal';
}

export function PredictiveServiceCalendar() {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');

  // Fetch trucks
  const { data: trucks } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*').eq('status', 'active');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch delivered loads for mileage calculation
  const { data: deliveredLoads } = useQuery({
    queryKey: ['fleet-loads-delivered-mileage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('truck_id, actual_miles, booked_miles, pickup_date, delivery_date')
        .eq('status', 'delivered')
        .not('truck_id', 'is', null)
        .order('delivery_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch service schedules
  const { data: serviceSchedules } = useQuery({
    queryKey: ['service-schedules-predictive'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('service_schedules') as any)
        .select('*, trucks(unit_number, current_odometer, make, model)')
        .not('interval_miles', 'is', null);
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = !trucks || !deliveredLoads || !serviceSchedules;

  // Calculate average daily mileage per truck
  const truckAvgDailyMiles = useMemo(() => {
    if (!deliveredLoads) return new Map<string, { avg: number; loadCount: number }>();

    const byTruck = new Map<string, typeof deliveredLoads>();
    deliveredLoads.forEach(load => {
      if (!load.truck_id) return;
      const existing = byTruck.get(load.truck_id) || [];
      existing.push(load);
      byTruck.set(load.truck_id, existing);
    });

    const result = new Map<string, { avg: number; loadCount: number }>();
    byTruck.forEach((loads, truckId) => {
      const totalMiles = loads.reduce((sum, l) => sum + (l.actual_miles || l.booked_miles || 0), 0);
      const dates = loads
        .map(l => l.delivery_date || l.pickup_date)
        .filter(Boolean)
        .map(d => new Date(d!))
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length < 2) {
        // Not enough data, use a conservative default
        result.set(truckId, { avg: totalMiles > 0 ? 400 : 0, loadCount: loads.length });
        return;
      }

      const daySpan = Math.max(1, differenceInDays(dates[dates.length - 1], dates[0]));
      result.set(truckId, { avg: totalMiles / daySpan, loadCount: loads.length });
    });

    return result;
  }, [deliveredLoads]);

  // Project future service dates
  const projectedServices = useMemo((): ProjectedService[] => {
    if (!serviceSchedules || !trucks) return [];

    const today = startOfDay(new Date());
    const results: ProjectedService[] = [];

    serviceSchedules.forEach((schedule: any) => {
      const truck = trucks.find(t => t.id === schedule.truck_id);
      if (!truck) return;

      const currentOdometer = truck.current_odometer || 0;
      const lastPerformedMiles = schedule.last_performed_miles || truck.purchase_mileage || 0;
      const intervalMiles = schedule.interval_miles;
      if (!intervalMiles) return;

      const milesSinceService = currentOdometer - lastPerformedMiles;
      const remainingMiles = intervalMiles - milesSinceService;

      const mileageData = truckAvgDailyMiles.get(schedule.truck_id);
      const avgDaily = mileageData?.avg || 400; // fallback
      const loadCount = mileageData?.loadCount || 0;

      const confidence: 'high' | 'medium' | 'low' =
        loadCount >= 10 ? 'high' : loadCount >= 3 ? 'medium' : 'low';

      let projectedDate: Date;
      let urgency: ProjectedService['urgency'];

      if (remainingMiles <= 0) {
        projectedDate = today;
        urgency = 'overdue';
      } else if (avgDaily <= 0) {
        projectedDate = addDays(today, 365); // unknown
        urgency = 'normal';
      } else {
        const daysUntilDue = Math.ceil(remainingMiles / avgDaily);
        projectedDate = addDays(today, daysUntilDue);
        urgency = daysUntilDue <= 0 ? 'overdue' : daysUntilDue <= 14 ? 'soon' : daysUntilDue <= 30 ? 'upcoming' : 'normal';
      }

      results.push({
        truckId: schedule.truck_id,
        unitNumber: schedule.trucks?.unit_number || truck.unit_number,
        make: (truck.make || '').trim(),
        serviceName: schedule.service_name,
        projectedDate,
        remainingMiles: Math.max(0, remainingMiles),
        avgDailyMiles: Math.round(avgDaily),
        confidence,
        urgency,
      });
    });

    return results.sort((a, b) => a.projectedDate.getTime() - b.projectedDate.getTime());
  }, [serviceSchedules, trucks, truckAvgDailyMiles]);

  // Filter to next 90 days
  const ninetyDaysOut = addDays(new Date(), 90);
  const filteredServices = projectedServices.filter(s => s.projectedDate <= ninetyDaysOut || s.urgency === 'overdue');

  // Calendar grid: group by week
  const calendarWeeks = useMemo(() => {
    const today = startOfDay(new Date());
    const weeks: { start: Date; days: Date[] }[] = [];
    for (let w = 0; w < 13; w++) {
      const weekStart = addDays(today, w * 7);
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      weeks.push({ start: weekStart, days });
    }
    return weeks;
  }, []);

  const getServicesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return filteredServices.filter(s => format(s.projectedDate, 'yyyy-MM-dd') === dateStr);
  };

  const getUrgencyStyle = (urgency: ProjectedService['urgency']) => {
    switch (urgency) {
      case 'overdue': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'soon': return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700';
      case 'upcoming': return 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getUrgencyIcon = (urgency: ProjectedService['urgency']) => {
    switch (urgency) {
      case 'overdue': return <AlertTriangle className="h-3 w-3" />;
      case 'soon': return <Clock className="h-3 w-3" />;
      case 'upcoming': return <CalendarDays className="h-3 w-3" />;
      default: return <CheckCircle className="h-3 w-3" />;
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high': return <Badge variant="outline" className="text-[10px] px-1">High</Badge>;
      case 'medium': return <Badge variant="outline" className="text-[10px] px-1 border-amber-300 text-amber-600">Med</Badge>;
      default: return <Badge variant="outline" className="text-[10px] px-1 border-muted text-muted-foreground">Low</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const overdueCount = filteredServices.filter(s => s.urgency === 'overdue').length;
  const soonCount = filteredServices.filter(s => s.urgency === 'soon').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">Predictive Service Calendar</h3>
            <p className="text-xs text-muted-foreground">
              Projected service dates based on avg daily mileage • Next 90 days
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {overdueCount > 0 && (
            <Badge variant="destructive" className="text-xs">{overdueCount} overdue</Badge>
          )}
          {soonCount > 0 && (
            <Badge className="bg-amber-500 text-xs">{soonCount} due soon</Badge>
          )}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode('calendar')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {filteredServices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Upcoming Services Projected</h3>
          <p className="text-sm text-muted-foreground">
            All services are well within their intervals, or no schedule data is available.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* List View */
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-2">
            {filteredServices.map((svc, i) => (
              <div
                key={`${svc.truckId}-${svc.serviceName}-${i}`}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  getUrgencyStyle(svc.urgency)
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {getUrgencyIcon(svc.urgency)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{svc.unitNumber}</span>
                      {svc.make && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">({svc.make})</span>
                      )}
                    </div>
                    <p className="text-sm truncate">{svc.serviceName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  <div>
                    <p className="text-sm font-medium">
                      {svc.urgency === 'overdue' ? 'OVERDUE' : format(svc.projectedDate, 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {svc.remainingMiles.toLocaleString()} mi remaining • {svc.avgDailyMiles} mi/day
                    </p>
                  </div>
                  {getConfidenceBadge(svc.confidence)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        /* Calendar View */
        <TooltipProvider>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-1">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {d}
                  </div>
                ))}
              </div>
              {calendarWeeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1">
                  {week.days.map((day, di) => {
                    const dayServices = getServicesForDate(day);
                    const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <div
                        key={di}
                        className={cn(
                          'min-h-[52px] rounded-md border p-1 text-xs',
                          isToday && 'ring-2 ring-primary/50',
                          dayServices.some(s => s.urgency === 'overdue') && 'bg-destructive/5',
                          dayServices.some(s => s.urgency === 'soon') && !dayServices.some(s => s.urgency === 'overdue') && 'bg-amber-50/50 dark:bg-amber-950/10'
                        )}
                      >
                        <div className="text-[10px] text-muted-foreground mb-0.5">
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5">
                          {dayServices.slice(0, 2).map((svc, si) => (
                            <Tooltip key={si}>
                              <TooltipTrigger asChild>
                                <div className={cn(
                                  'truncate rounded px-0.5 text-[9px] leading-tight cursor-default border',
                                  getUrgencyStyle(svc.urgency)
                                )}>
                                  {svc.unitNumber}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px]">
                                <p className="font-medium">{svc.unitNumber} — {svc.serviceName}</p>
                                <p className="text-xs">{svc.remainingMiles.toLocaleString()} mi remaining</p>
                                <p className="text-xs">{svc.avgDailyMiles} mi/day avg • {svc.confidence} confidence</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {dayServices.length > 2 && (
                            <div className="text-[9px] text-muted-foreground text-center">
                              +{dayServices.length - 2}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TooltipProvider>
      )}
    </div>
  );
}
