import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, ChevronDown, Clock, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';
import { useState } from 'react';

interface DriverPayWidgetProps {
  driverId: string;
  payRate: number | null;
  payType: string | null;
}

export function DriverPayWidget({ driverId, payRate, payType }: DriverPayWidgetProps) {
  const [accessorialsOpen, setAccessorialsOpen] = useState(false);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });

  // Get driver settings for goals
  const { data: driverSettings } = useQuery({
    queryKey: ['driver-settings', driverId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('driver_settings' as any) as any)
        .select('*')
        .eq('driver_id', driverId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

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
  });

  // Calculate earnings
  const totalMiles = weeklyLoads.reduce((sum, load) => sum + (load.booked_miles || 0), 0);
  const totalRate = weeklyLoads.reduce((sum, load) => sum + (load.rate || 0), 0);
  const allAccessorials = weeklyLoads.flatMap(load => 
    (load.load_accessorials || []).map((a: any) => ({
      ...a,
      loadId: load.landstar_load_id || load.id.slice(0, 8),
    }))
  );
  const accessorialsTotal = allAccessorials.reduce((sum, a) => sum + (a.amount || 0), 0);

  let weeklyEarnings = 0;
  if (payType === 'percentage' && payRate) {
    weeklyEarnings = (totalRate + accessorialsTotal) * (payRate / 100);
  } else if (payType === 'per_mile' && payRate) {
    weeklyEarnings = totalMiles * payRate;
  }

  // Weekly goals from driver settings
  const weeklyMilesGoal = driverSettings?.weekly_miles_goal || 2500;
  const weeklyRevenueGoal = driverSettings?.weekly_revenue_goal || 3000;
  
  const weeklyGoal = payType === 'per_mile' ? weeklyMilesGoal : weeklyRevenueGoal;
  const progress = payType === 'per_mile' 
    ? (totalMiles / weeklyGoal) * 100 
    : (weeklyEarnings / weeklyGoal) * 100;

  const deliveredCount = weeklyLoads.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          My Pay This Week
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Earnings Summary */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-primary">
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
              {payType === 'per_mile' 
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

        {/* Accessorials Collapsible */}
        {allAccessorials.length > 0 && (
          <Collapsible open={accessorialsOpen} onOpenChange={setAccessorialsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Accessorials & Extras</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  ${accessorialsTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Badge>
                <ChevronDown className={`h-4 w-4 transition-transform ${accessorialsOpen ? 'rotate-180' : ''}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                {allAccessorials.map((accessorial, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">
                        #{accessorial.loadId}
                      </span>
                      <span className="capitalize">
                        {accessorial.accessorial_type?.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="font-medium">
                      ${accessorial.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

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
    </Card>
  );
}
