import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, Receipt } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { useState, lazy, Suspense } from 'react';
import { calculateWeeklyPay } from '@/utils/payCalculations';
import { usePaySettings } from '@/hooks/usePaySettings';
import { useDriverSettlementsRealtime } from '@/hooks/useDriverSettlementsRealtime';
const MyPaystubsDialog = lazy(() =>
  import('./MyPaystubsDialog').then(m => ({ default: m.MyPaystubsDialog })),
);

interface DriverPayWidgetProps {
  driverId: string;
  payRate: number | null;
  payType: string | null;
}

export function DriverPayWidget({ driverId, payRate, payType }: DriverPayWidgetProps) {
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
        .gte('delivery_date', weekStart.toISOString().split('T')[0])
        .lte('delivery_date', weekEnd.toISOString().split('T')[0])
        .eq('status', 'delivered');
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
  const progress = isMileageGoal
    ? (totalMiles / Math.max(weeklyGoal, 1)) * 100
    : (weeklyEarnings / Math.max(weeklyGoal, 1)) * 100;

  const deliveredCount = weeklyLoads.length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          My Pay This Week
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setPaystubsOpen(true)}
        >
          <Receipt className="h-3.5 w-3.5 mr-1.5" />
          My Settlements
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Earnings Summary */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xl sm:text-3xl font-bold text-primary truncate">
              ${weeklyEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d')}
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              {totalMiles.toLocaleString()} miles
            </div>
            <p className="text-muted-foreground">
              {deliveredCount} delivered this week
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Weekly Progress</span>
            <span className="font-medium">
              {isMileageGoal
                ? `${totalMiles.toLocaleString()} / ${weeklyGoal.toLocaleString()} mi`
                : `$${weeklyEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })} / $${weeklyGoal.toLocaleString()}`
              }
            </span>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-3" />
          {progress >= 100 && (
            <p className="text-xs text-success font-medium">
              🎉 Weekly goal reached!
            </p>
          )}
        </div>




        {/* Pay Rate Info */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Pay structure: {payType === 'percentage' 
            ? `${payRate}% of line haul` 
            : payType === 'per_mile' 
              ? `$${payRate}/mile` 
              : 'Contact payroll'
          }
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
