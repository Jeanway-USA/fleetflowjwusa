import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  count?: number | null;
  isLoading?: boolean;
}

/**
 * Status pill for the Payroll Setup page. Displays the number of remaining
 * Gusto onboarding blockers. Wire `count` to the Gusto onboarding endpoint
 * in a follow-up — for now callers pass `null` and get a neutral placeholder.
 */
export function PayrollBlockerBadge({ count, isLoading }: Props) {
  if (isLoading) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking status…
      </Badge>
    );
  }

  if (count == null) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />— blockers
      </Badge>
    );
  }

  if (count === 0) {
    return (
      <Badge className="gap-1.5 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30">
        <CheckCircle2 className="h-3.5 w-3.5" />
        All clear
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1.5">
      <AlertTriangle className="h-3.5 w-3.5" />
      {count} blocker{count === 1 ? '' : 's'}
    </Badge>
  );
}
