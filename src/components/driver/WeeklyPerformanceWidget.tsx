import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Gauge, Target, TrendingUp, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  getDate,
  getDaysInMonth,
} from 'date-fns';

interface WeeklyPerformanceWidgetProps {
  driverId: string;
}

const MONTHLY_BONUS_TARGET = 10000;

export function WeeklyPerformanceWidget({ driverId }: WeeklyPerformanceWidgetProps) {
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
  });

  const weekStartsOn = (driverSettings?.pay_week_start_day ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn });
  const weekEnd = endOfWeek(now, { weekStartsOn });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

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
  });

  const { data: monthlyLoads = [] } = useQuery({
    queryKey: ['driver-monthly-perf-loads', driverId, monthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('booked_miles, delivery_date')
        .eq('driver_id', driverId)
        .gte('delivery_date', monthStart.toISOString().split('T')[0])
        .lte('delivery_date', monthEnd.toISOString().split('T')[0])
        .eq('status', 'delivered');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!driverId,
  });

  const milesThisWeek = weeklyLoads.reduce(
    (sum: number, l: any) => sum + (l.booked_miles || 0),
    0,
  );
  const targetMiles = driverSettings?.target_miles ?? driverSettings?.weekly_miles_goal ?? 2500;
  const weekProgressPct = Math.min(100, targetMiles > 0 ? (milesThisWeek / targetMiles) * 100 : 0);

  const monthMiles = monthlyLoads.reduce(
    (sum: number, l: any) => sum + (l.booked_miles || 0),
    0,
  );
  const daysElapsed = Math.max(1, getDate(now));
  const daysInMonth = getDaysInMonth(now);
  const dailyVelocity = monthMiles / daysElapsed;
  const projectedMonthMiles = Math.round(dailyVelocity * daysInMonth);

  let paceLabel: string;
  let paceVariant: 'success' | 'warning' | 'destructive';
  if (projectedMonthMiles >= MONTHLY_BONUS_TARGET) {
    paceLabel = 'On Pace';
    paceVariant = 'success';
  } else if (projectedMonthMiles >= 9000) {
    paceLabel = 'Slightly Behind';
    paceVariant = 'warning';
  } else {
    paceLabel = 'Off Pace';
    paceVariant = 'destructive';
  }

  const paceBadgeClass =
    paceVariant === 'success'
      ? 'bg-success text-success-foreground hover:bg-success'
      : paceVariant === 'warning'
        ? 'bg-warning text-warning-foreground hover:bg-warning'
        : 'bg-destructive text-destructive-foreground hover:bg-destructive';

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          Weekly Performance
        </CardTitle>
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

        {/* Bonus Pacing */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Target className="h-4 w-4 text-primary" />
              Monthly Bonus Pacing
            </div>
            <Badge className={paceBadgeClass}>{paceLabel}</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Projected {projectedMonthMiles.toLocaleString()} / {MONTHLY_BONUS_TARGET.toLocaleString()} safe miles
          </div>
          <p className="text-xs text-muted-foreground">
            {monthMiles.toLocaleString()} miles in {daysElapsed} day{daysElapsed === 1 ? '' : 's'} so far
          </p>
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
    </Card>
  );
}
