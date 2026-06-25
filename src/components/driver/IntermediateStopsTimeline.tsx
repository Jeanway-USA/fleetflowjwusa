import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, Circle, Clock, MapPin, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useTimeDisplay } from '@/contexts/TimeDisplayContext';
import { ConfirmStopDialog } from './ConfirmStopDialog';

interface IntermediateStop {
  id: string;
  load_id: string;
  stop_number: number | null;
  stop_type: string | null;
  facility_name: string | null;
  location: string | null;
  scheduled_date: string | null;
  status: string | null;
  remaining_hos: number | null;
  completed_at: string | null;
}

interface IntermediateStopsTimelineProps {
  loadId: string;
}

function formatScheduled(date: string | null): string | null {
  if (!date) return null;
  try {
    // Date-only strings: prevent timezone shift.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date;
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    return null;
  }
}

function formatCompletedAt(ts: string | null, tz: string): string | null {
  if (!ts) return null;
  try {
    return formatInTimeZone(ts, tz, 'MMM d, h:mm a zzz');
  } catch {
    return null;
  }
}

export function IntermediateStopsTimeline({ loadId }: IntermediateStopsTimelineProps) {
  const { viewerTz } = useTimeDisplay();
  const queryClient = useQueryClient();
  const [activeStop, setActiveStop] = useState<IntermediateStop | null>(null);

  const { data: stops, isLoading } = useQuery({
    queryKey: ['load-intermediate-stops', loadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('load_intermediate_stops')
        .select('*')
        .eq('load_id', loadId)
        .order('stop_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as IntermediateStop[];
    },
    enabled: !!loadId,
    staleTime: 60_000,
  });

  const firstPendingId = useMemo(() => {
    return stops?.find((s) => (s.status ?? 'pending') === 'pending')?.id ?? null;
  }, [stops]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading stops...
      </div>
    );
  }

  if (!stops || stops.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-semibold">Intermediate Stops</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {stops.filter((s) => s.status === 'completed').length}/{stops.length} completed
        </span>
      </div>

      <ol className="space-y-3">
        {stops.map((stop, idx) => {
          const status = stop.status ?? 'pending';
          const isCompleted = status === 'completed';
          const isNext = stop.id === firstPendingId;
          const isLast = idx === stops.length - 1;
          const scheduled = formatScheduled(stop.scheduled_date);
          const completedAt = formatCompletedAt(stop.completed_at, viewerTz);

          return (
            <li key={stop.id} className="relative flex gap-3">
              {/* Connector */}
              {!isLast && (
                <span
                  className={`absolute left-[10px] top-6 bottom-[-12px] w-px ${
                    isCompleted ? 'bg-primary' : 'bg-border'
                  }`}
                  aria-hidden="true"
                />
              )}

              {/* Status dot */}
              <div className="shrink-0 pt-0.5">
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className={`h-5 w-5 ${isNext ? 'text-warning' : 'text-muted-foreground'}`} />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Stop {stop.stop_number ?? idx + 1}
                  </span>
                  {stop.stop_type && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {stop.stop_type}
                    </span>
                  )}
                  {scheduled && (
                    <span className="text-xs text-muted-foreground">{scheduled}</span>
                  )}
                </div>

                {stop.facility_name && (
                  <p className="text-sm font-medium leading-tight">{stop.facility_name}</p>
                )}
                {stop.location && (
                  <p className="text-xs text-muted-foreground leading-tight">{stop.location}</p>
                )}

                {isCompleted ? (
                  <div className="flex items-center gap-3 text-xs text-success pt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed{completedAt ? ` · ${completedAt}` : ''}
                    </span>
                    {stop.remaining_hos !== null && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        HOS left: {stop.remaining_hos} hr
                      </span>
                    )}
                  </div>
                ) : isNext ? (
                  <Button
                    size="sm"
                    className="h-12 w-full sm:w-auto mt-1"
                    onClick={() => setActiveStop(stop)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Confirm Stop Delivery
                  </Button>
                ) : (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-12 w-full sm:w-auto mt-1"
                            disabled
                          >
                            Confirm Stop Delivery
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Complete previous stops first</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <ConfirmStopDialog
        open={!!activeStop}
        onOpenChange={(o) => !o && setActiveStop(null)}
        stop={activeStop}
        onConfirmed={() => {
          queryClient.invalidateQueries({ queryKey: ['load-intermediate-stops', loadId] });
        }}
      />
    </div>
  );
}
