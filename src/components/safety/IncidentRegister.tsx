import { lazy, Suspense, useMemo } from 'react';
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/finance/statement-ui';
import { ChartSkeleton } from '@/components/shared/LazyFallbacks';

const IncidentTrendsChart = lazy(() => import('@/components/safety/IncidentTrendsChart').then((m) => ({ default: m.IncidentTrendsChart })));
const trendChartConfig = {
  total: { label: 'Total Incidents', color: 'hsl(var(--warning))' },
  critical: { label: 'Critical/Major', color: 'hsl(var(--destructive))' },
};

/** A crash with an injury, a citation or a serious rating is the kind that may be DOT-recordable. Someone still has to decide. */
export const mayBeRecordable = (i: { injuries_reported: boolean | null; citation_issued: boolean | null; severity: string | null }) =>
  !!i.injuries_reported || !!i.citation_issued || i.severity === 'major' || i.severity === 'critical';

/** The accident register (kept 3 years) and the six-month trend. Incidents themselves are entered on the Incidents page. */
export function IncidentRegister({ incidents, drivers, trucks }: { incidents: any[]; drivers: any[]; trucks: any[] }) {
  const driverName = useMemo(() => new Map(drivers.map((d) => [d.id, `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim()])), [drivers]);
  const truckUnit = useMemo(() => new Map(trucks.map((t) => [t.id, t.unit_number])), [trucks]);
  const accidents = incidents.filter((i) => i.incident_type === 'accident' || i.incident_type === 'injury');
  const trend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, k) => {
      const start = startOfMonth(subMonths(now, 5 - k));
      const end = endOfMonth(start);
      const inMonth = incidents.filter((i) => { const d = parseISO(i.incident_date); return d >= start && d <= end; });
      return { month: format(start, 'MMM'), total: inMonth.length, critical: inMonth.filter((i) => i.severity === 'critical' || i.severity === 'major').length };
    });
  }, [incidents]);

  return (
    <div className="space-y-5">
      <Panel
        title="Accident register"
        description="Accidents and injuries from the last 3 years, which is how long DOT requires the register to be kept. Decide for each whether it is DOT-recordable: a fatality, an injury treated away from the scene, or a tow-away."
        aside={<Link to="/incidents" className="text-sm underline">Record or edit incidents</Link>}
      >
        {accidents.length === 0 ? <p className="border-t py-4 text-sm text-muted-foreground">No accidents or injuries recorded in the last 3 years.</p> : (
          <ul className="divide-y border-t">
            {accidents.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                <span className="w-28 shrink-0 tabular-nums">{format(parseISO(i.incident_date), 'MMM d, yyyy')}</span>
                <span className="min-w-[8rem] font-medium">{driverName.get(i.driver_id) || 'No driver'}</span>
                <span className="text-muted-foreground">{i.truck_id && truckUnit.get(i.truck_id) ? `Truck ${truckUnit.get(i.truck_id)}` : ''}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{i.description}</span>
                {mayBeRecordable(i) && <Badge variant="outline" className="rounded-sm border-warning/40 text-xs font-normal text-warning">May be DOT-recordable</Badge>}
                <Badge variant="outline" className="rounded-sm text-xs font-normal capitalize">{String(i.status).replace('_', ' ')}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {incidents.length > 0 && (
        <Panel title="Incidents, last 6 months" description="Monthly count, with critical and major incidents shown separately.">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <IncidentTrendsChart data={trend} config={trendChartConfig} />
          </Suspense>
        </Panel>
      )}
    </div>
  );
}
