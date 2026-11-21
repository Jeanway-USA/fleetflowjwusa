import { CheckCircle2 } from 'lucide-react';
import { CriticalAlertsBar, type CriticalAlert } from './CriticalAlertsBar';
import { PendingActionsCard, type PendingAction } from './PendingActionsCard';

interface NeedsYouProps {
  alerts: CriticalAlert[];
  actions: PendingAction[];
  isLoading: boolean;
}

/**
 * Phone top block: the critical alerts and the to-do list when there is something to tap, or a single quiet line
 * saying nothing needs the owner, so "does anything need me?" is answered without scrolling.
 */
export function NeedsYou({ alerts, actions, isLoading }: NeedsYouProps) {
  if (!isLoading && alerts.length === 0 && actions.length === 0) {
    return (
      <div className="flex min-h-[48px] items-center gap-2 rounded-lg border bg-card px-4 text-[15px]">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        Nothing needs you right now.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <CriticalAlertsBar alerts={alerts} isLoading={isLoading} />
      {(isLoading || actions.length > 0) && <PendingActionsCard actions={actions} isLoading={isLoading} />}
    </div>
  );
}
