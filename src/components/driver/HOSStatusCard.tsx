import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, AlertTriangle, CheckCircle, Pause, Truck, Coffee, BedDouble } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const DUTY_STATUSES = [
  { value: 'driving', label: 'Driving', icon: Truck, color: 'text-blue-500' },
  { value: 'on_duty_not_driving', label: 'On Duty', icon: Clock, color: 'text-amber-500' },
  { value: 'sleeper_berth', label: 'Sleeper', icon: BedDouble, color: 'text-purple-500' },
  { value: 'off_duty', label: 'Off Duty', icon: Coffee, color: 'text-green-500' },
];

const HOS_LIMITS = {
  driving: 11,
  onDuty: 14,
  cycle: 70,
};

interface Props {
  driverId: string;
}

export function HOSStatusCard({ driverId }: Props) {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: hosLog, isLoading } = useQuery({
    queryKey: ['hos-log', driverId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hos_logs')
        .select('*')
        .eq('driver_id', driverId)
        .eq('log_date', today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      if (hosLog) {
        const { error } = await supabase
          .from('hos_logs')
          .update({
            duty_status: newStatus,
            last_status_change: new Date().toISOString(),
          })
          .eq('id', hosLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('hos_logs')
          .insert({
            driver_id: driverId,
            log_date: today,
            duty_status: newStatus,
            last_status_change: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hos-log', driverId, today] });
      toast.success('Duty status updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateHoursMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      if (hosLog) {
        const { error } = await supabase
          .from('hos_logs')
          .update(updates)
          .eq('id', hosLog.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hos-log', driverId, today] });
    },
  });

  const currentStatus = hosLog?.duty_status || 'off_duty';
  const drivingUsed = Number(hosLog?.driving_hours_used) || 0;
  const onDutyUsed = Number(hosLog?.on_duty_hours_used) || 0;
  const cycleUsed = Number(hosLog?.cycle_hours_used) || 0;

  const drivingRemaining = Math.max(0, HOS_LIMITS.driving - drivingUsed);
  const onDutyRemaining = Math.max(0, HOS_LIMITS.onDuty - onDutyUsed);
  const cycleRemaining = Math.max(0, HOS_LIMITS.cycle - cycleUsed);

  const statusInfo = DUTY_STATUSES.find(s => s.value === currentStatus) || DUTY_STATUSES[3];
  const StatusIcon = statusInfo.icon;

  const hasViolation = drivingRemaining <= 0 || onDutyRemaining <= 0;
  const isWarning = drivingRemaining <= 1 || onDutyRemaining <= 1;

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="h-24 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`card-elevated ${hasViolation ? 'border-destructive/50' : isWarning ? 'border-warning/50' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Hours of Service
          </CardTitle>
          <Badge variant="outline" className={`${statusInfo.color} border-current/20`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusInfo.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick Status Change */}
        <div className="flex gap-1.5 flex-wrap">
          {DUTY_STATUSES.map((status) => (
            <Button
              key={status.value}
              size="sm"
              variant={currentStatus === status.value ? 'default' : 'outline'}
              className="gap-1 text-xs h-7"
              onClick={() => upsertMutation.mutate(status.value)}
              disabled={upsertMutation.isPending}
            >
              <status.icon className="h-3 w-3" />
              {status.label}
            </Button>
          ))}
        </div>

        {/* Hours Bars */}
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Driving</span>
              <span className={drivingRemaining <= 1 ? 'text-destructive font-medium' : ''}>
                {drivingRemaining.toFixed(1)}h remaining
              </span>
            </div>
            <Progress 
              value={(drivingUsed / HOS_LIMITS.driving) * 100} 
              className="h-2"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">On-Duty Window</span>
              <span className={onDutyRemaining <= 1 ? 'text-destructive font-medium' : ''}>
                {onDutyRemaining.toFixed(1)}h remaining
              </span>
            </div>
            <Progress 
              value={(onDutyUsed / HOS_LIMITS.onDuty) * 100} 
              className="h-2"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">70h/8-Day Cycle</span>
              <span>{cycleRemaining.toFixed(1)}h remaining</span>
            </div>
            <Progress 
              value={(cycleUsed / HOS_LIMITS.cycle) * 100} 
              className="h-2"
            />
          </div>
        </div>

        {/* 30-min break status */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
          <span className="text-muted-foreground">30-Min Break</span>
          {hosLog?.break_taken ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
              <CheckCircle className="h-3 w-3 mr-1" /> Taken
            </Badge>
          ) : (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-6 text-xs gap-1"
              onClick={() => updateHoursMutation.mutate({ break_taken: true })}
            >
              <Pause className="h-3 w-3" /> Mark Break
            </Button>
          )}
        </div>

        {/* Warnings */}
        {hasViolation && (
          <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 p-2 rounded-md">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">HOS violation: hours exceeded</span>
          </div>
        )}
        {isWarning && !hasViolation && (
          <div className="flex items-center gap-2 text-warning text-xs bg-warning/10 p-2 rounded-md">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">Low hours remaining — plan accordingly</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
