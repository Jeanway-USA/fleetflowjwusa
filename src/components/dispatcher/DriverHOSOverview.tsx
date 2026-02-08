import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, AlertTriangle, Truck, Coffee, BedDouble } from 'lucide-react';
import { format } from 'date-fns';

const DUTY_STATUS_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  driving: { label: 'Driving', icon: Truck, color: 'text-blue-500' },
  on_duty_not_driving: { label: 'On Duty', icon: Clock, color: 'text-amber-500' },
  sleeper_berth: { label: 'Sleeper', icon: BedDouble, color: 'text-purple-500' },
  off_duty: { label: 'Off Duty', icon: Coffee, color: 'text-green-500' },
};

export function DriverHOSOverview() {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['dispatcher-hos-overview', today],
    queryFn: async () => {
      // Get all active drivers
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .eq('status', 'active')
        .order('first_name');
      if (driversError) throw driversError;

      // Get today's HOS logs
      const { data: hosLogs, error: hosError } = await supabase
        .from('hos_logs')
        .select('*')
        .eq('log_date', today);
      if (hosError) throw hosError;

      const hosMap = new Map(hosLogs?.map(h => [h.driver_id, h]));

      return drivers?.map(driver => ({
        ...driver,
        hos: hosMap.get(driver.id) || null,
      })) || [];
    },
  });

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            HOS Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const driversWithHOS = data || [];
  const violationCount = driversWithHOS.filter(d => {
    if (!d.hos) return false;
    return Number(d.hos.driving_hours_used) >= 11 || Number(d.hos.on_duty_hours_used) >= 14;
  }).length;

  const warningCount = driversWithHOS.filter(d => {
    if (!d.hos) return false;
    const drivingRemaining = 11 - Number(d.hos.driving_hours_used);
    const onDutyRemaining = 14 - Number(d.hos.on_duty_hours_used);
    return (drivingRemaining > 0 && drivingRemaining <= 2) || (onDutyRemaining > 0 && onDutyRemaining <= 2);
  }).length;

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          HOS Overview
        </CardTitle>
        <CardDescription>
          {violationCount > 0 && (
            <span className="text-destructive font-medium">{violationCount} violation{violationCount > 1 ? 's' : ''}</span>
          )}
          {violationCount > 0 && warningCount > 0 && ' • '}
          {warningCount > 0 && (
            <span className="text-warning font-medium">{warningCount} warning{warningCount > 1 ? 's' : ''}</span>
          )}
          {violationCount === 0 && warningCount === 0 && 'All drivers within limits'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {driversWithHOS.map((driver) => {
            const hos = driver.hos;
            const drivingUsed = Number(hos?.driving_hours_used) || 0;
            const drivingPct = (drivingUsed / 11) * 100;
            const drivingRemaining = Math.max(0, 11 - drivingUsed);
            const status = hos?.duty_status || 'off_duty';
            const statusInfo = DUTY_STATUS_LABELS[status] || DUTY_STATUS_LABELS.off_duty;
            const StatusIcon = statusInfo.icon;
            const isViolation = drivingRemaining <= 0;
            const isWarning = drivingRemaining > 0 && drivingRemaining <= 2;

            return (
              <div
                key={driver.id}
                className={`p-2.5 rounded-lg border transition-colors ${
                  isViolation ? 'border-destructive/40 bg-destructive/5' :
                  isWarning ? 'border-warning/40 bg-warning/5' :
                  'border-border bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium truncate">
                    {driver.first_name} {driver.last_name}
                  </span>
                  <Badge variant="outline" className={`${statusInfo.color} border-current/20 text-xs shrink-0`}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusInfo.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={drivingPct} className="h-1.5 flex-1" />
                  <span className={`text-xs font-mono min-w-[3.5rem] text-right ${
                    isViolation ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'
                  }`}>
                    {drivingRemaining.toFixed(1)}h left
                  </span>
                  {(isViolation || isWarning) && (
                    <AlertTriangle className={`h-3 w-3 shrink-0 ${isViolation ? 'text-destructive' : 'text-warning'}`} />
                  )}
                </div>
              </div>
            );
          })}
          {driversWithHOS.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No active drivers found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
