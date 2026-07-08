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
          'hover:bg-red-100 dark:hover:bg-red-900/30',
          activeFilter === 'overdue' 
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
            : 'text-red-600 dark:text-red-400'
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
          'hover:bg-amber-100 dark:hover:bg-amber-900/30',
          activeFilter === 'due-soon' 
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' 
            : 'text-amber-600 dark:text-amber-400'
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
          'hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
          activeFilter === 'on-track' 
            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' 
            : 'text-emerald-600 dark:text-emerald-400'
        )}
      >
        <CheckCircle className="h-3.5 w-3.5" />
        <span>{onTrackCount} On Track</span>
      </button>

      <div className="ml-auto text-xs text-muted-foreground">
        {total} trucks total
      </div>
    </div>
  );
}
