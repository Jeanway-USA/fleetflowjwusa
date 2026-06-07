import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Gauge, Truck, Receipt } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek } from 'date-fns';
import { useState, lazy, Suspense } from 'react';
const MyPaystubsDialog = lazy(() =>
  import('./MyPaystubsDialog').then(m => ({ default: m.MyPaystubsDialog })),
);

interface WeeklyPerformanceWidgetProps {
  driverId: string;
  payRate?: number | null;
  payType?: string | null;
}

export function WeeklyPerformanceWidget({ driverId, payRate = null, payType = null }: WeeklyPerformanceWidgetProps) {
  const [paystubsOpen, setPaystubsOpen] = useState(false);

  const { data: driverRow } = useQuery({
    queryKey: ['driver-name', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('first_name, last_name')
        .eq('id', driverId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
    staleTime: 15 * 60 * 1000,
  });

  const { data: driverSettings } = useQuery({
    queryKey: ['driver-settings', driverId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('driver_settings_safe' as any) as any)
        .select('target_miles, weekly_miles_goal, pay_week_start_day')
        .eq('driver_id', driverId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
    staleTime: 15 * 60 * 1000,
  });

  const weekStartsOn = (driverSettings?.pay_week_start_day ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn });
  const weekEnd = endOfWeek(now, { weekStartsOn });

  const { data: weeklyLoads = [] } = useQuery({
    queryKey: ['driver-weekly-perf-loads', driverId, weekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('booked_miles, delivery_date')
        .eq('driver_id', driverId)
        .gte('delivery_date', weekStart.toISOString().split('T')[0])
        .lte('delivery_date', weekEnd.toISOString().split('T')[0])
        .eq('status', 'delivered');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!driverId,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const milesThisWeek = weeklyLoads.reduce(
    (sum: number, l: any) => sum + (l.booked_miles || 0),
    0,
  );
  const targetMiles = driverSettings?.target_miles ?? driverSettings?.weekly_miles_goal ?? 2500;
  const weekProgressPct = Math.min(100, targetMiles > 0 ? (milesThisWeek / targetMiles) * 100 : 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          Weekly Performance
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setPaystubsOpen(true)}
        >
          <Receipt className="h-3.5 w-3.5 mr-1.5" />
          My Paystubs
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Miles this week */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Miles Driven This Week
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-foreground">
              {milesThisWeek.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground">
              of {targetMiles.toLocaleString()} mi target
            </span>
          </div>
          <Progress value={weekProgressPct} className="h-2" />
          <p className="text-xs text-muted-foreground">{Math.round(weekProgressPct)}% of weekly goal</p>
        </div>

        {/* Deadhead */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Truck className="h-4 w-4 text-primary" />
            Deadhead Percentage
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-semibold text-muted-foreground cursor-help">—</span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Deadhead tracking coming soon</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>

      {paystubsOpen && (
        <Suspense fallback={null}>
          <MyPaystubsDialog
            open={paystubsOpen}
            onOpenChange={setPaystubsOpen}
            driverId={driverId}
            driverName={`${driverRow?.first_name ?? ''} ${driverRow?.last_name ?? ''}`.trim() || 'Driver'}
            payType={payType}
            payRate={payRate}
          />
        </Suspense>
      )}
    </Card>
  );
}
