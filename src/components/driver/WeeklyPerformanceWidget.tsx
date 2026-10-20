import { toLocalIso } from '@/lib/datetime';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek } from 'date-fns';
import { Link } from 'react-router-dom';
import { Bar, HeadLink, Panel, PanelHead } from '@/components/driver/ui/driver-ui';

interface WeeklyPerformanceWidgetProps {
  driverId: string;
  payRate?: number | null;
  payType?: string | null;
}

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
        .gte('delivery_date', toLocalIso(weekStart))
        .lte('delivery_date', toLocalIso(weekEnd))
        .eq('status', 'delivered')
        .is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!driverId,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const milesThisWeek = weeklyLoads.reduce((sum: number, l: any) => sum + (l.booked_miles || 0), 0);
  const targetMiles = driverSettings?.target_miles ?? driverSettings?.weekly_miles_goal ?? 2500;
  const pct = Math.round(Math.min(100, targetMiles > 0 ? (milesThisWeek / targetMiles) * 100 : 0));

  return (
    <Panel>
      <PanelHead title="This week" aside={<HeadLink asChild><Link to="/driver/settlements">Settlements</Link></HeadLink>} />
      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground">Miles driven</p>
        <p className="mt-0.5 font-condensed text-4xl font-bold tabular-nums leading-tight">{milesThisWeek.toLocaleString()}</p>
        <Bar className="mt-3" value={milesThisWeek} max={targetMiles} label="Miles toward weekly goal" />
        <p className="mt-2 text-xs text-muted-foreground">{pct}% of your {targetMiles.toLocaleString()} mile target</p>
      </div>
    </Panel>
  );
}
