import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, CalendarRange, DoorOpen } from 'lucide-react';

interface TimeTypeBadgeProps {
  timeType: string | null | undefined;
  time: string | null | undefined;
  /** Optional end time for Open Window ranges. When present, display renders `start - end`. */
  endTime?: string | null;
  variant?: 'compact' | 'full' | 'driver';
  label?: string; // e.g. "Pickup" or "Delivery"
}

export function TimeTypeBadge({ timeType, time, endTime, variant = 'compact', label }: TimeTypeBadgeProps) {
  if (!time) return null;

  const isWindow = timeType === 'window';
  const isFcfs = timeType === 'fcfs';

  // For Open Window with an explicit end, show a range.
  const displayTime = isWindow && endTime ? `${time} - ${endTime}` : time;

  if (variant === 'driver') {
    if (isWindow) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
                <CalendarRange className="h-3.5 w-3.5" />
                🟢 OPEN WINDOW: {displayTime}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              Open Window means you can arrive any time within the listed time range during normal facility hours.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (isFcfs) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                <DoorOpen className="h-3.5 w-3.5" />
                🔵 FCFS: opens at {time}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              First Come First Served — arrive from {time} onward; queue order determines service.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 dark:text-orange-400">
        <Clock className="h-3.5 w-3.5" />
        🚨 STRICT APPT: {time}
      </span>
    );
  }

  if (variant === 'full') {
    if (isWindow) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 text-xs gap-1">
                <CalendarRange className="h-3 w-3" />
                Window: {displayTime}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              Open Window means arrival any time within the listed range during facility hours.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (isFcfs) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-xs gap-1">
                <DoorOpen className="h-3 w-3" />
                FCFS: {time}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              First Come First Served — arrive from {time} onward.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 text-xs gap-1">
        <Clock className="h-3 w-3" />
        Appt: {time}
      </Badge>
    );
  }

  // compact (default)
  if (isWindow) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CalendarRange className="h-3 w-3" />
              Window{endTime ? `: ${displayTime}` : ''}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[250px] text-xs">
            Open Window — arrive any time {endTime ? `between ${time} and ${endTime}` : `after ${time}`} during facility hours.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (isFcfs) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <DoorOpen className="h-3 w-3" />
              FCFS
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[250px] text-xs">
            First Come First Served — arrive from {time} onward.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
      <Clock className="h-3 w-3" />
      Appt
    </span>
  );
}
