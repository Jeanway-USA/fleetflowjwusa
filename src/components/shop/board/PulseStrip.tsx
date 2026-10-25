import { cn } from '@/lib/utils';
import { formatMinutes, money, type BoardSummary } from '@/lib/shop/board';
import { LANE_STYLE } from '@/components/shop/shared';

function Pulse({ label, value, sub, tone, wall }: { label: string; value: string | number; sub?: string; tone?: string; wall?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-condensed font-bold leading-none tabular-nums', wall ? 'text-6xl' : 'text-4xl', tone)}>{value}</p>
      {sub && <p className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** The five numbers a shop lead checks first. */
export function PulseStrip({ summary, fleetSize, doneToday, wall }: { summary: BoardSummary; fleetSize: number | null; doneToday: number; wall?: boolean }) {
  return (
    <div className="grid grid-cols-2 divide-border rounded-lg border bg-card [&>div]:border-b lg:grid-cols-5 lg:[&>div]:border-b-0 lg:[&>div:not(:last-child)]:border-r [&>div:nth-child(odd)]:border-r lg:[&>div:nth-child(odd)]:border-r">
      <Pulse
        wall={wall}
        label="Trucks in the shop"
        value={summary.trucksDown}
        sub={fleetSize ? `of ${fleetSize} in the fleet${summary.longestDown && summary.longestDown.days > 0 ? `, longest ${summary.longestDown.unit} (${summary.longestDown.days}d)` : ''}` : undefined}
        tone={summary.trucksDown > 0 ? 'text-foreground' : 'text-success'}
      />
      <Pulse wall={wall} label="On the lift" value={summary.perLane.working} sub={summary.unassigned > 0 ? `${summary.unassigned} job${summary.unassigned === 1 ? '' : 's'} with nobody on them` : 'Everyone has a job'} tone={LANE_STYLE.working.text} />
      <Pulse wall={wall} label="Waiting" value={summary.perLane.waiting} sub={summary.overdue > 0 ? `${summary.overdue} past the needed-by date` : 'Nothing overdue'} tone={summary.perLane.waiting > 0 ? LANE_STYLE.waiting.text : undefined} />
      <Pulse wall={wall} label="Ready to close" value={summary.perLane.ready} sub="All tasks done" tone={summary.perLane.ready > 0 ? LANE_STYLE.ready.text : undefined} />
      <Pulse wall={wall} label="Finished today" value={doneToday} sub={`${formatMinutes(summary.laborMinutes)} labor, ${money(summary.partsCost)} parts on open jobs`} tone="text-success" />
    </div>
  );
}
