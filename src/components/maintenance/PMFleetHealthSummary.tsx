import { AlertTriangle, CheckCircle, Clock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HealthStatus } from './PMScheduleFilters';
import { useChronicIssueTrucks } from '@/hooks/useMaintenanceData';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PMFleetHealthSummaryProps {
  overdueCount: number;
  dueSoonCount: number;
  onTrackCount: number;
  onFilterClick: (status: HealthStatus) => void;
  activeFilter: HealthStatus;
}

export function PMFleetHealthSummary({
  overdueCount,
  dueSoonCount,
  onTrackCount,
  onFilterClick,
  activeFilter,
}: PMFleetHealthSummaryProps) {
  const total = overdueCount + dueSoonCount + onTrackCount;
  const { data: chronic } = useChronicIssueTrucks();
  const chronicCount = chronic?.count ?? 0;

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border mb-4 flex-wrap">
      <span className="text-sm font-medium text-muted-foreground mr-2">
        Fleet PM Health
      </span>
      
      <button
        onClick={() => onFilterClick(activeFilter === 'overdue' ? 'all' : 'overdue')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          'hover:bg-destructive/10 dark:hover:bg-destructive/10',
          activeFilter === 'overdue' 
            ? 'bg-destructive/10 dark:bg-destructive/10 text-destructive dark:text-destructive' 
            : 'text-destructive dark:text-destructive'
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{overdueCount} Overdue</span>
      </button>

      <div className="h-4 w-px bg-border" />

      <button
        onClick={() => onFilterClick(activeFilter === 'due-soon' ? 'all' : 'due-soon')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          'hover:bg-warning/15 dark:hover:bg-warning/15',
          activeFilter === 'due-soon' 
            ? 'bg-warning/15 dark:bg-warning/15 text-foreground dark:text-warning' 
            : 'text-warning dark:text-warning'
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        <span>{dueSoonCount} Due Soon</span>
      </button>

      <div className="h-4 w-px bg-border" />

      <button
        onClick={() => onFilterClick(activeFilter === 'on-track' ? 'all' : 'on-track')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          'hover:bg-success/15 dark:hover:bg-success/15',
          activeFilter === 'on-track' 
            ? 'bg-success/15 dark:bg-success/15 text-success dark:text-success' 
            : 'text-success dark:text-success'
        )}
      >
        <CheckCircle className="h-3.5 w-3.5" />
        <span>{onTrackCount} On Track</span>
      </button>

      {chronicCount > 0 && (
        <>
          <div className="h-4 w-px bg-border" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-help',
                    'bg-warning/15 dark:bg-warning/15 text-foreground dark:text-warning'
                  )}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>{chronicCount} High Vulnerability</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                ≥ 3 uncorrected minor issues in the last 30 days. Avoid long OTR assignments for these trucks.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}

      <div className="ml-auto text-xs text-muted-foreground">
        {total} trucks total
      </div>

    </div>
  );
}
