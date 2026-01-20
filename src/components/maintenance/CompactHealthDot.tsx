import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';

interface PMBaseline {
  workOrderId: string | null;
  date: string | null;
}

interface CompactHealthDotProps {
  serviceName: string;
  currentValue: number;
  lastPerformedValue: number;
  intervalValue: number;
  unit: 'miles' | 'days';
  baseline?: PMBaseline;
  description?: string | null;
}

export function CompactHealthDot({
  serviceName,
  currentValue,
  lastPerformedValue,
  intervalValue,
  unit,
  baseline,
  description,
}: CompactHealthDotProps) {
  const used = currentValue - lastPerformedValue;
  const remaining = intervalValue - used;
  
  // Thresholds
  const warningThreshold = unit === 'miles' ? 1000 : 14;
  const isOverdue = remaining < 0;
  const isWarning = remaining >= 0 && remaining <= warningThreshold;

  const getDotColor = () => {
    if (isOverdue) return 'bg-red-500';
    if (isWarning) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getTextColor = () => {
    if (isOverdue) return 'text-red-600';
    if (isWarning) return 'text-amber-600';
    return 'text-emerald-600';
  };

  const formatRemainingLine = () => {
    if (isOverdue) {
      return `Overdue by ${Math.abs(remaining).toLocaleString()} ${unit}`;
    }
    return `${remaining.toLocaleString()} ${unit} remaining`;
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center p-1 cursor-help">
            <div 
              className={cn(
                'h-3 w-3 rounded-full transition-transform hover:scale-125',
                getDotColor(),
                isOverdue && 'animate-pulse'
              )} 
            />
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="text-sm space-y-1">
            <p className="font-medium">{serviceName}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            <p>Interval: {intervalValue.toLocaleString()} {unit}</p>
            <p>Used: {used.toLocaleString()} / {intervalValue.toLocaleString()} {unit}</p>
            <p className={getTextColor()}>{formatRemainingLine()}</p>
            {baseline && (
              <div className="pt-1 border-t border-border mt-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span>
                    {baseline.date 
                      ? `Baseline: ${format(new Date(baseline.date + 'T00:00:00'), 'MMM d, yyyy')}`
                      : 'No service recorded'}
                  </span>
                </div>
                {baseline.workOrderId && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    WO: {baseline.workOrderId.slice(0, 8)}...
                  </p>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface CompactInspectionDotProps {
  lastInspectionDate: string | null;
  intervalDays: number;
}

export function CompactInspectionDot({
  lastInspectionDate,
  intervalDays,
}: CompactInspectionDotProps) {
  const today = new Date();
  const lastDate = lastInspectionDate ? new Date(lastInspectionDate + 'T00:00:00') : null;
  
  let daysRemaining: number;
  if (!lastDate) {
    daysRemaining = -999;
  } else {
    const dueDate = new Date(lastDate);
    dueDate.setDate(dueDate.getDate() + intervalDays);
    daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const isOverdue = daysRemaining < 0;
  const isCritical = daysRemaining >= 0 && daysRemaining <= 7;
  const isWarning = daysRemaining > 7 && daysRemaining <= 14;

  const getDotColor = () => {
    if (isOverdue || isCritical) return 'bg-red-500';
    if (isWarning) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center p-1 cursor-help">
            <div 
              className={cn(
                'h-3 w-3 rounded-full transition-transform hover:scale-125',
                getDotColor(),
                (isOverdue || isCritical) && 'animate-pulse'
              )} 
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm space-y-1">
            <p className="font-medium">120-Day Inspection</p>
            <p>
              {!lastDate ? (
                'Never Inspected'
              ) : isOverdue ? (
                <span className="text-red-600">Overdue by {Math.abs(daysRemaining)} days</span>
              ) : (
                <span>{daysRemaining} days remaining</span>
              )}
            </p>
            {lastDate && (
              <p className="text-xs text-muted-foreground">
                Last: {format(lastDate, 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
