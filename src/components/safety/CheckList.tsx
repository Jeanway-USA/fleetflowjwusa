import { AlertTriangle, CheckCircle2, Clock, FileQuestion, Info, SearchCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Check, CheckStatus } from '@/lib/safety/compliance';

export const STATUS_UI: Record<CheckStatus, { label: string; text: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Good', text: 'text-success', icon: CheckCircle2 },
  soon: { label: 'Due soon', text: 'text-warning', icon: Clock },
  overdue: { label: 'Overdue', text: 'text-destructive', icon: AlertTriangle },
  missing: { label: 'Missing', text: 'text-destructive', icon: FileQuestion },
  review: { label: 'Review', text: 'text-warning', icon: SearchCheck },
  info: { label: 'For your information', text: 'text-muted-foreground', icon: Info },
};

/** One line per check: what is true now and, in smaller type, the rule behind it. */
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {checks.map((c) => {
        const ui = STATUS_UI[c.status];
        const Icon = ui.icon;
        return (
          <li key={c.key} className="flex gap-3 p-3">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ui.text)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm font-medium">{c.label}</p>
                <span className={cn('text-xs font-medium', ui.text)}>{ui.label}</span>
              </div>
              <p className="text-sm text-muted-foreground">{c.detail}</p>
              <p className="mt-0.5 text-xs text-muted-foreground/80">{c.rule}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
