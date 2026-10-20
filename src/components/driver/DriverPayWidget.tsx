import { toLocalIso } from '@/lib/datetime';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { Link } from 'react-router-dom';
import { calculateWeeklyPay } from '@/utils/payCalculations';
import { usePaySettings } from '@/hooks/usePaySettings';
import { useDriverSettlementsRealtime } from '@/hooks/useDriverSettlementsRealtime';
import { Bar, HeadLink, Panel, PanelHead, Stat, StatCell, StatRow } from '@/components/driver/ui/driver-ui';

interface DriverPayWidgetProps {
  driverId: string;
  payRate: number | null;
  payType: string | null;
}

const dollars = (v: number, fraction = 2) => `$${v.toLocaleString(undefined, { minimumFractionDigits: fraction, maximumFractionDigits: fraction })}`;

export function DriverPayWidget({ driverId, payRate, payType }: DriverPayWidgetProps) {
  // Keep widget + settlements list in sync with admin changes in real-time.
  useDriverSettlementsRealtime(driverId);

  // Get driver settings for goals and pay week start day
  const { data: driverSettings } = useQuery({
    queryKey: ['driver-settings', driverId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('driver_settings_safe' as any) as any)
        .select('weekly_miles_goal, weekly_revenue_goal, pay_week_start_day, goal_type, target_miles')
        .eq('driver_id', driverId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
    staleTime: 15 * 60 * 1000,
  });

  const weekStartsOn = (driverSettings?.pay_week_start_day ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const weekStart = startOfWeek(new Date(), { weekStartsOn });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn });

  // Get this week's delivered loads (only count pay after delivery)
  const { data: weeklyLoads = [] } = useQuery({
    queryKey: ['driver-weekly-loads', driverId, weekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, load_accessorials(*)')
        .eq('driver_id', driverId)
        .gte('delivery_date', toLocalIso(weekStart))
        .lte('delivery_date', toLocalIso(weekEnd))
        .eq('status', 'delivered')
        .is('deleted_at', null);
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // === Unified pay calculation ===
  const paySettings = usePaySettings();
  const weekly = calculateWeeklyPay({
    loads: weeklyLoads as any,
    driver: { pay_type: payType, pay_rate: payRate },
    settings: paySettings,
  });
  const totalMiles = weekly.totalMiles;
  const weeklyEarnings = weekly.total;

  // Weekly goals from driver settings
  const weeklyMilesGoal = driverSettings?.weekly_miles_goal || 2500;
  const weeklyRevenueGoal = driverSettings?.weekly_revenue_goal || 3000;
  const goalType: 'financial' | 'mileage' = driverSettings?.goal_type || (payType === 'per_mile' ? 'mileage' : 'financial');
  const targetMiles = driverSettings?.target_miles ?? weeklyMilesGoal;

  const isMileageGoal = goalType === 'mileage';
  const weeklyGoal = isMileageGoal ? targetMiles : weeklyRevenueGoal;
  const progressValue = isMileageGoal ? totalMiles : weeklyEarnings;
  const pct = Math.round(Math.min(100, (progressValue / Math.max(weeklyGoal, 1)) * 100));

  return (
    <Panel>
      <PanelHead title="Pay this week" aside={<HeadLink asChild><Link to="/driver/settlements">Settlements</Link></HeadLink>} />
      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground">{format(weekStart, 'MMM d')} to {format(weekEnd, 'MMM d')}</p>
        <p className="mt-0.5 font-condensed text-4xl font-bold tabular-nums leading-tight">{dollars(weeklyEarnings)}</p>
        <Bar className="mt-3" value={progressValue} max={weeklyGoal} label={isMileageGoal ? 'Miles toward weekly goal' : 'Pay toward weekly goal'} />
        <p className="mt-2 text-xs text-muted-foreground">
          {pct}% of your {isMileageGoal ? `${weeklyGoal.toLocaleString()} mile` : dollars(weeklyGoal, 0)} goal
          {progressValue >= weeklyGoal ? '. Goal reached.' : ''}
        </p>
      </div>
      <StatRow>
        <StatCell><Stat label="Miles">{totalMiles.toLocaleString()}</Stat></StatCell>
        <StatCell><Stat label="Delivered">{weeklyLoads.length}</Stat></StatCell>
      </StatRow>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Pay structure: {payType === 'percentage' ? `${payRate}% of line haul` : payType === 'per_mile' ? `$${payRate} a mile` : 'Contact payroll'}
      </p>
    </Panel>
  );
}
