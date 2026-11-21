import { AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WeekSummary } from '@/lib/week-import';

const ISSUE_LABEL = {
  missing_load: 'Missing load',
  revenue: 'Revenue',
  charges: 'Charges',
  advances: 'Advances',
} as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' | 'plain' }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2">
      <div className={cn('figure text-3xl font-bold tabular-nums', tone === 'good' && 'text-success', tone === 'warn' && value > 0 && 'text-destructive')}>{value}</div>
      <div className="text-[13px] text-muted-foreground">{label}</div>
    </div>
  );
}

interface WeekStatementSummaryProps {
  summary: WeekSummary;
  onDone: () => void;
}

/**
 * The one screen after "Prove this week": what matched, what was imported, and what still needs the office,
 * with the open trips listed by number and lane. The fixing itself happens in the Settlement tab, which already
 * holds the weekly proof and its tools, so the button here goes there rather than starting a second place to fix.
 */
export function WeekStatementSummary({ summary, onDone }: WeekStatementSummaryProps) {
  const { frame, outcome } = summary;
  const shown = summary.issues.slice(0, 10);

  return (
    <section aria-labelledby="week-summary-title" className="space-y-4">
      <div className="flex items-start gap-3">
        {summary.clean ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning" />}
        <div className="min-w-0">
          <h3 id="week-summary-title" className="font-condensed text-xl font-bold">
            {summary.clean ? `${frame.label} is proven` : `${frame.label}: ${summary.proved ? 'not fully proven yet' : 'imported, not proven'}`}
          </h3>
          <p className="text-[13px] text-muted-foreground">Landstar settlement week, {frame.range}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Trips proven" value={summary.proven} tone="good" />
        <Stat label="Trips with issues" value={summary.open} tone="warn" />
        <Stat label="Expenses added" value={outcome?.inserted ?? 0} />
        <Stat label="Loads still missing" value={summary.byIssue.missing_load} tone="warn" />
      </div>
      {summary.proved && summary.open > 0 && (
        <p className="text-[13px] text-muted-foreground tabular-nums">
          Amounts that disagree: revenue on {summary.byIssue.revenue}, charges on {summary.byIssue.charges}, advances on {summary.byIssue.advances} trip{summary.open === 1 ? '' : 's'}.
        </p>
      )}

      <ul className="space-y-1.5 text-[15px]">
        {summary.lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
            {line}
          </li>
        ))}
      </ul>

      {shown.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Needs attention</p>
          <ul className="divide-y rounded-lg border">
            {shown.map((row) => (
              <li key={row.trip} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">Trip {row.trip}</span>
                  {row.issues.map((i) => (
                    <Badge key={i} variant="outline" className="text-xs">{ISSUE_LABEL[i]}</Badge>
                  ))}
                </div>
                {row.lane && <p className="text-[13px] text-muted-foreground">{row.lane}</p>}
                {row.detail.map((d) => (
                  <p key={d} className="text-[13px]">{d}</p>
                ))}
              </li>
            ))}
          </ul>
          {summary.issues.length > shown.length && (
            <p className="mt-1 text-[13px] text-muted-foreground">{summary.issues.length - shown.length} more are listed in the Settlement tab.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {!summary.clean && (
          <Button asChild className="h-12 sm:h-10 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/finance?view=settlement" onClick={onDone}>
              Fix what is open <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
        <Button variant="outline" className="h-12 sm:h-10" onClick={onDone}>Done</Button>
      </div>
    </section>
  );
}
