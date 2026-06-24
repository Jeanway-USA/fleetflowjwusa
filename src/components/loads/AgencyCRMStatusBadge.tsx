import { useEffect } from 'react';
import { Loader2, ShieldCheck, AlertTriangle, Sparkles, Info } from 'lucide-react';
import { useAgencyCRMStatus } from '@/hooks/useAgencyCRMStatus';

interface Props {
  agencyCode: string | null | undefined;
  onBlockedChange?: (blocked: boolean) => void;
}

export function AgencyCRMStatusBadge({ agencyCode, onBlockedChange }: Props) {
  const state = useAgencyCRMStatus(agencyCode);
  const blocked = state.status === 'found' && state.isBlocked;

  useEffect(() => {
    onBlockedChange?.(blocked);
  }, [blocked, onBlockedChange]);

  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking CRM…
      </div>
    );
  }

  if (state.status === 'not_found') {
    return (
      <div className="mt-1 flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs text-blue-700 dark:text-blue-300">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>✦ New Agency:</strong> Will auto-harvest as Safe in the CRM when this load is saved.
        </span>
      </div>
    );
  }

  // found
  if (state.isBlocked) {
    return (
      <div className="mt-1 rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-destructive">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertTriangle className="h-4 w-4" />
          ⚠ WARNING: DO NOT USE — Agency Blocked
        </div>
        <div className="mt-1 text-xs space-y-0.5">
          {state.companyName && (
            <div><span className="font-semibold">Agency:</span> {state.companyName}</div>
          )}
          <div><span className="font-semibold">Status:</span> {state.agentStatus}</div>
          {state.notes && (
            <div className="whitespace-pre-wrap"><span className="font-semibold">Reason:</span> {state.notes}</div>
          )}
          <div className="pt-1 italic">Submission is disabled until a different agency code is used.</div>
        </div>
      </div>
    );
  }

  if (state.agentStatus === 'safe') {
    return (
      <div className="mt-1 flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>✓ CRM Approved: Safe</strong>
          {state.companyName ? ` — ${state.companyName}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-start gap-2 rounded-md border border-muted-foreground/30 bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        CRM status: <strong>{state.agentStatus}</strong>
        {state.companyName ? ` — ${state.companyName}` : ''}
      </span>
    </div>
  );
}
