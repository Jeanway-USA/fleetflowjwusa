import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Issue, IssueLevel } from '@/lib/tax/issues';
import { formatCurrency } from '@/lib/formatters';

export type TabKey = 'overview' | 'people' | 'filings' | 'w2' | 'states' | 'records' | 'contractors';

export const money = (n: number) => formatCurrency(n);

const LEVEL: Record<IssueLevel, { label: string; className: string; icon: typeof Info }> = {
  fix: { label: 'Fix before filing', className: 'border-destructive/40 bg-destructive/5 text-destructive', icon: AlertTriangle },
  check: { label: 'Check', className: 'border-warning/40 bg-warning/5 text-warning', icon: AlertTriangle },
  note: { label: 'Good to know', className: 'border-border bg-muted/40 text-muted-foreground', icon: Info },
};

export function IssueRow({ issue, onOpen }: { issue: Issue; onOpen?: (tab: TabKey) => void }) {
  const L = LEVEL[issue.level];
  const Icon = L.icon;
  return (
    <li className={cn('flex gap-3 rounded-md border p-3', L.className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{issue.title}</p>
        <p className="text-sm text-muted-foreground">{issue.detail}</p>
      </div>
      {issue.tab && onOpen && (
        <button type="button" className="shrink-0 self-start text-sm font-medium text-primary underline-offset-2 hover:underline" onClick={() => onOpen(issue.tab as TabKey)}>
          Open
        </button>
      )}
    </li>
  );
}

export function Ready({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn('gap-1 rounded-sm text-xs font-normal', ok ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive')}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {children}
    </Badge>
  );
}

/** A labeled row of figures: label on the left, amount on the right, optional note underneath. */
export function Line({ label, note, value, strong, muted }: { label: string; note?: string; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0', strong && 'font-semibold')}>
      <div className="min-w-0">
        <p className={cn('text-sm', muted && 'text-muted-foreground')}>{label}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <p className="shrink-0 tabular-nums text-sm">{value}</p>
    </div>
  );
}
