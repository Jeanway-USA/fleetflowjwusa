import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

interface PMBaseline {
  workOrderId: string | null;
  date: string | null;
}

interface HealthBarProps {
  serviceName: string;
  currentValue: number;
  lastPerformedValue: number;
  intervalValue: number;
  unit: 'miles' | 'days';
  baseline?: PMBaseline;
  className?: string;
}

export function HealthBar({
  serviceName,
  currentValue,
  lastPerformedValue,
  intervalValue,
  unit,
  baseline,
  className,
}: HealthBarProps) {
  const used = currentValue - lastPerformedValue;
  const remaining = intervalValue - used;
  const percentageUsed = Math.min((used / intervalValue) * 100, 100);
  
  // Thresholds
  const warningThreshold = unit === 'miles' ? 1000 : 14;
  const isOverdue = remaining < 0;
  const isWarning = remaining >= 0 && remaining <= warningThreshold;
  const isGood = remaining > warningThreshold;

  const getBarColor = () => {
    if (isOverdue) return 'bg-red-500';
    if (isWarning) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getTextColor = () => {
    if (isOverdue) return 'text-red-600';
    if (isWarning) return 'text-amber-600';
    return 'text-emerald-600';
  };

  const formatRemaining = () => {
    if (isOverdue) {
      return `Overdue by ${Math.abs(remaining).toLocaleString()} ${unit}`;
    }
    return `${remaining.toLocaleString()} ${unit} remaining`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('w-full min-w-[120px]', className)}>
            <div className="flex items-center gap-1 mb-1">
              {isOverdue ? (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              ) : isWarning ? (
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              ) : (
                <CheckCircle className="h-3 w-3 text-emerald-500" />
              )}
              <span className={cn('text-xs font-medium', getTextColor())}>
                {serviceName}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full transition-all', getBarColor())}
                style={{ width: `${Math.min(percentageUsed, 100)}%` }}
              />
            </div>
            <p className={cn('text-xs mt-0.5', getTextColor())}>
              {formatRemaining()}
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm space-y-1">
            <p className="font-medium">{serviceName}</p>
            <p>Interval: {intervalValue.toLocaleString()} {unit}</p>
            <p>Miles since service: {used.toLocaleString()} {unit}</p>
            <p className={getTextColor()}>{formatRemaining()}</p>
            {baseline && (
              <div className="pt-1 border-t border-border mt-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span>
                    {baseline.date 
                      ? `Baseline: ${format(new Date(baseline.date), 'MMM d, yyyy')}`
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

interface InspectionCountdownProps {
  lastInspectionDate: string | null;
  intervalDays: number;
  className?: string;
}

export function InspectionCountdown({
  lastInspectionDate,
  intervalDays,
  className,
}: InspectionCountdownProps) {
  const today = new Date();
  const lastDate = lastInspectionDate ? new Date(lastInspectionDate) : null;
  
  let daysRemaining: number;
  if (!lastDate) {
    daysRemaining = -999; // Never performed
  } else {
    const dueDate = new Date(lastDate);
    dueDate.setDate(dueDate.getDate() + intervalDays);
    daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const isOverdue = daysRemaining < 0;
  const isCritical = daysRemaining >= 0 && daysRemaining <= 7;
  const isWarning = daysRemaining > 7 && daysRemaining <= 14;
  const isGood = daysRemaining > 14;

  const getContainerClasses = () => {
    if (isOverdue || isCritical) return 'bg-red-100 border-red-300 text-red-800';
    if (isWarning) return 'bg-amber-100 border-amber-300 text-amber-800';
    return 'bg-emerald-100 border-emerald-300 text-emerald-800';
  };

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium',
      getContainerClasses(),
      (isOverdue || isCritical) && 'animate-pulse',
      className
    )}>
      {isOverdue || isCritical ? (
        <AlertTriangle className="h-3 w-3" />
      ) : isWarning ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <CheckCircle className="h-3 w-3" />
      )}
      <span>
        {!lastDate ? (
          'Never Inspected'
        ) : isOverdue ? (
          `OVERDUE ${Math.abs(daysRemaining)}d`
        ) : (
          `${daysRemaining}d remaining`
        )}
      </span>
    </div>
  );
}
