import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, CalendarRange } from 'lucide-react';

interface TimeTypeBadgeProps {
  timeType: string | null | undefined;
  time: string | null | undefined;
  variant?: 'compact' | 'full' | 'driver';
  label?: string; // e.g. "Pickup" or "Delivery"
}

export function TimeTypeBadge({ timeType, time, variant = 'compact', label }: TimeTypeBadgeProps) {
  if (!time) return null;

  const isWindow = timeType === 'window';
  const effectiveType = timeType || 'appointment';

  if (variant === 'driver') {
    if (isWindow) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
                <CalendarRange className="h-3.5 w-3.5" />
                🟢 OPEN WINDOW: starts at {time}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              Open Window means you can arrive any time after the listed start time during normal facility hours.
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
                Window: {time}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              Open Window means you can arrive any time after the listed start time during normal facility hours.
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
              Window
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[250px] text-xs">
            Open Window — arrive any time after {time} during facility hours.
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
