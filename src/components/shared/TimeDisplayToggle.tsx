/**
 * Pill toggle in the dashboard header: Company Time ↔ Local Time.
 *
 * Affects every stop time across the app via TimeDisplayContext.
 */

import { Clock } from 'lucide-react';
import { useTimeDisplay } from '@/contexts/TimeDisplayContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function TimeDisplayToggle() {
  const { mode, setMode, companyTz, localTz } = useTimeDisplay();

  const sameZone = companyTz === localTz;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center rounded-full border border-border bg-background p-0.5 text-xs">
          <Clock className="ml-1.5 mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <button
            type="button"
            onClick={() => setMode('company')}
            className={cn(
              'rounded-full px-2.5 py-1 font-medium transition-colors',
              mode === 'company'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={mode === 'company'}
          >
            Company
          </button>
          <button
            type="button"
            onClick={() => setMode('local')}
            className={cn(
              'rounded-full px-2.5 py-1 font-medium transition-colors',
              mode === 'local'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={mode === 'local'}
          >
            Local
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {sameZone ? (
          <>You're in the company timezone ({companyTz.replace('_', ' ')}). Switching has no effect right now.</>
        ) : mode === 'company' ? (
          <>Showing the viewer's time in company timezone ({companyTz.replace('_', ' ')}). Switch to Local to see times in your browser zone ({localTz.replace('_', ' ')}).</>
        ) : (
          <>Showing the viewer's time in your local zone ({localTz.replace('_', ' ')}). Each stop is still labeled with its own zone.</>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
