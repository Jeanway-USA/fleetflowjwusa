import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, differenceInMinutes, differenceInHours } from 'date-fns';
import { Clock, ArrowRight, User, CheckCircle2, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';

interface StatusHistoryLogProps {
  loadId: string;
  pickupDate?: string | null;
  pickupTime?: string | null;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
}

interface StatusLog {
  id: string;
  previous_status: string | null;
  new_status: string;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  loading: 'Loading',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function StatusHistoryLog({ loadId, pickupDate, pickupTime, deliveryDate, deliveryTime }: StatusHistoryLogProps) {
  const { data: statusLogs = [], isLoading } = useQuery({
    queryKey: ['load_status_logs', loadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('load_status_logs')
        .select('*')
        .eq('load_id', loadId)
        .order('changed_at', { ascending: true });
      
      if (error) throw error;
      return data as StatusLog[];
    },
    enabled: !!loadId,
  });

  // Parse scheduled times for comparison
  const parseScheduledTime = (date?: string | null, time?: string | null) => {
    if (!date) return null;
    try {
      // Combine date and time if time is available
      if (time) {
        // Parse time string like "8:00 AM" or "14:00"
        const dateObj = parseISO(date);
        const timeMatch = time.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2] || '0');
          const period = timeMatch[3];
          
          if (period?.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (period?.toUpperCase() === 'AM' && hours === 12) hours = 0;
          
          dateObj.setHours(hours, minutes, 0, 0);
        }
        return dateObj;
      }
      return parseISO(date);
    } catch {
      return null;
    }
  };

  const scheduledPickup = parseScheduledTime(pickupDate, pickupTime);
  const scheduledDelivery = parseScheduledTime(deliveryDate, deliveryTime);

  // Find actual pickup and delivery times from status logs
  const loadingLog = statusLogs.find(log => log.new_status === 'loading');
  const inTransitLog = statusLogs.find(log => log.new_status === 'in_transit');
  const deliveredLog = statusLogs.find(log => log.new_status === 'delivered');

  const formatTimeDiff = (minutes: number) => {
    const absMinutes = Math.abs(minutes);
    if (absMinutes < 60) {
      return `${absMinutes} min`;
    }
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getTimingStatus = (scheduled: Date | null, actual: string | null) => {
    if (!scheduled || !actual) return null;
    
    const actualDate = parseISO(actual);
    const diffMinutes = differenceInMinutes(actualDate, scheduled);
    
    if (diffMinutes <= 15) {
      return { status: 'on-time', label: 'On Time', color: 'text-green-500' };
    } else if (diffMinutes <= 60) {
      return { status: 'slightly-late', label: `${formatTimeDiff(diffMinutes)} late`, color: 'text-yellow-500' };
    } else {
      return { status: 'late', label: `${formatTimeDiff(diffMinutes)} late`, color: 'text-red-500' };
    }
  };

  // Calculate pickup timing (when driver arrived/started loading)
  const pickupTiming = loadingLog ? getTimingStatus(scheduledPickup, loadingLog.changed_at) : null;
  
  // Calculate delivery timing
  const deliveryTiming = deliveredLog ? getTimingStatus(scheduledDelivery, deliveredLog.changed_at) : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (statusLogs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No status changes recorded yet.</p>
        <p className="text-sm mt-1">Status history will appear here when the load status is updated.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timing Summary */}
      {(pickupTiming || deliveryTiming) && (
        <div className="grid grid-cols-2 gap-4">
          {scheduledPickup && (
            <div className="p-4 rounded-lg border bg-card">
              <p className="text-sm text-muted-foreground mb-1">Pickup Performance</p>
              {pickupTiming ? (
                <div className="flex items-center gap-2">
                  {pickupTiming.status === 'on-time' ? (
                    <CheckCircle2 className={`h-5 w-5 ${pickupTiming.color}`} />
                  ) : (
                    <AlertTriangle className={`h-5 w-5 ${pickupTiming.color}`} />
                  )}
                  <span className={`font-semibold ${pickupTiming.color}`}>{pickupTiming.label}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not started yet</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Scheduled: {format(scheduledPickup, 'MMM d, h:mm a')}
              </p>
            </div>
          )}
          
          {scheduledDelivery && (
            <div className="p-4 rounded-lg border bg-card">
              <p className="text-sm text-muted-foreground mb-1">Delivery Performance</p>
              {deliveryTiming ? (
                <div className="flex items-center gap-2">
                  {deliveryTiming.status === 'on-time' ? (
                    <CheckCircle2 className={`h-5 w-5 ${deliveryTiming.color}`} />
                  ) : (
                    <AlertTriangle className={`h-5 w-5 ${deliveryTiming.color}`} />
                  )}
                  <span className={`font-semibold ${deliveryTiming.color}`}>{deliveryTiming.label}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not delivered yet</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Scheduled: {format(scheduledDelivery, 'MMM d, h:mm a')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
        
        <div className="space-y-4">
          {statusLogs.map((log, index) => (
            <div key={log.id} className="relative flex gap-4 pl-10">
              <div className="absolute left-2 w-4 h-4 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              
              <div className="flex-1 p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  {log.previous_status && (
                    <>
                      <StatusBadge status={log.previous_status} />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </>
                  )}
                  <StatusBadge status={log.new_status} />
                  
                  {/* Show timing badge for key transitions */}
                  {log.new_status === 'loading' && pickupTiming && (
                    <span className={`ml-2 text-xs font-medium ${pickupTiming.color}`}>
                      ({pickupTiming.label})
                    </span>
                  )}
                  {log.new_status === 'delivered' && deliveryTiming && (
                    <span className={`ml-2 text-xs font-medium ${deliveryTiming.color}`}>
                      ({deliveryTiming.label})
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {format(parseISO(log.changed_at), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
                
                {log.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{log.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
