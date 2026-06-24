import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Circle, Clock, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';

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

interface IntermediateStopsViewProps {
  loadId: string;
  /** Compact variant uses tighter spacing for dense dispatcher views. */
  compact?: boolean;
}

function formatScheduled(date: string | null): string | null {
  if (!date) return null;
  try {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date;
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch { return null; }
}

function formatCompletedAt(ts: string | null): string | null {
  if (!ts) return null;
  try { return format(parseISO(ts), 'MMM d, yyyy · h:mm a'); }
  catch { return null; }
}

/**
 * Read-only timeline of structured intermediate stops for dispatchers/admins.
 * Highlights HOS compliance: shows remaining HOS and a warning if a driver
 * logged < 2 hours remaining at a stop.
 */
export function IntermediateStopsView({ loadId, compact = false }: IntermediateStopsViewProps) {
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
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading stops...
      </div>
    );
  }

  if (!stops || stops.length === 0) return null;

  const completedCount = stops.filter((s) => s.status === 'completed').length;

  return (
    <div className={`rounded-lg border bg-card ${compact ? 'p-2.5' : 'p-3'} space-y-3`}>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-semibold">Intermediate Stops</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {completedCount}/{stops.length} completed
        </Badge>
      </div>

      <ol className="space-y-3">
        {stops.map((stop, idx) => {
          const status = stop.status ?? 'pending';
          const isCompleted = status === 'completed';
          const isLast = idx === stops.length - 1;
          const scheduled = formatScheduled(stop.scheduled_date);
          const completedAt = formatCompletedAt(stop.completed_at);
          const hosLow = isCompleted
            && stop.remaining_hos !== null
            && stop.remaining_hos < 2;

          return (
            <li key={stop.id} className="relative flex gap-3">
              {!isLast && (
                <span
                  className={`absolute left-[10px] top-6 bottom-[-12px] w-px ${
                    isCompleted ? 'bg-primary' : 'bg-border'
                  }`}
                  aria-hidden="true"
                />
              )}

              <div className="shrink-0 pt-0.5">
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Stop {stop.stop_number ?? idx + 1}
                  </span>
                  {stop.stop_type && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {stop.stop_type}
                    </span>
                  )}
                  <Badge
                    variant={isCompleted ? 'default' : 'secondary'}
                    className="text-[10px] capitalize"
                  >
                    {status}
                  </Badge>
                  {scheduled && (
                    <span className="text-xs text-muted-foreground ml-auto">{scheduled}</span>
                  )}
                </div>

                {stop.facility_name && (
                  <p className="text-sm font-medium leading-tight">{stop.facility_name}</p>
                )}
                {stop.location && (
                  <p className="text-xs text-muted-foreground leading-tight">{stop.location}</p>
                )}

                {isCompleted && (
                  <div className="mt-1.5 rounded-md border bg-muted/40 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="text-muted-foreground">Completed:</span>
                      <span className="font-medium">{completedAt ?? '—'}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ${hosLow ? 'text-destructive' : ''}`}>
                      {hosLow ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                      <span className={hosLow ? '' : 'text-muted-foreground'}>HOS left:</span>
                      <span className="font-semibold">
                        {stop.remaining_hos !== null ? `${stop.remaining_hos} hr` : 'Not logged'}
                      </span>
                      {hosLow && (
                        <span className="ml-1 text-[10px] uppercase font-bold">Low</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
