import { useState, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DriverComplianceHub } from '@/components/safety/DriverComplianceHub';
import { NewWorkOrderSheet, WorkOrderInitialData } from '@/components/maintenance/NewWorkOrderSheet';
import { format, addDays, isBefore, parseISO, subMonths, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';
import { ChartSkeleton } from '@/components/shared/LazyFallbacks';

const IncidentTrendsChart = lazy(() =>
  import('@/components/safety/IncidentTrendsChart').then(m => ({ default: m.IncidentTrendsChart })),
);


interface AlertItem {
  id: string;
  name: string;
  subtitle: string;
  date: string;
  isExpired: boolean;
}

export default function Safety() {
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [workOrderInitialData] = useState<WorkOrderInitialData | undefined>();

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*').is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').is('deleted_at', null);
      if (error) throw error;
      return data;
    },
  });

  // Fetch incidents for trend data (last 6 months)
  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-safety-trends'],
    queryFn: async () => {
      const sixMonthsAgo = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('incidents')
        .select('id, incident_date, incident_type, severity, status')
        .gte('incident_date', sixMonthsAgo)
        .order('incident_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Compute incident trend by month
  const incidentTrends = (() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const label = format(monthStart, 'MMM');
      const monthIncidents = incidents.filter(inc => {
        const d = new Date(inc.incident_date);
        return d >= monthStart && d <= monthEnd;
      });
      months.push({
        month: label,
        total: monthIncidents.length,
        critical: monthIncidents.filter(i => i.severity === 'critical' || i.severity === 'major').length,
      });
    }
    return months;
  })();

  const trendChartConfig = {
    total: { label: 'Total Incidents', color: 'hsl(var(--warning))' },
    critical: { label: 'Critical/Major', color: 'hsl(var(--destructive))' },
  };

  const today = new Date();
  const in30Days = addDays(today, 30);

  // Trucks with upcoming or overdue inspections
  const inspectionAlerts: AlertItem[] = trucks.filter(t => {
    if (!t.next_inspection_date) return false;
    const inspDate = parseISO(t.next_inspection_date);
    return isBefore(inspDate, in30Days);
  }).map(t => ({
    id: t.id,
    name: t.unit_number,
    subtitle: `${t.make || ''} ${t.model || ''}`.trim() || 'Truck',
    date: t.next_inspection_date!,
    isExpired: isBefore(parseISO(t.next_inspection_date!), today)
  }));

  // Drivers with license issues
  const licenseAlerts: AlertItem[] = drivers.filter(d => {
    if (!d.license_expiry) return false;
    const expDate = parseISO(d.license_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    subtitle: `License: ${d.license_number || 'N/A'}`,
    date: d.license_expiry!,
    isExpired: isBefore(parseISO(d.license_expiry!), today)
  }));

  // Drivers with medical card issues
  const medicalAlerts: AlertItem[] = drivers.filter(d => {
    if (!d.medical_card_expiry) return false;
    const expDate = parseISO(d.medical_card_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    subtitle: 'DOT Medical Card',
    date: d.medical_card_expiry!,
    isExpired: isBefore(parseISO(d.medical_card_expiry!), today)
  }));

  // Drivers with HAZMAT issues
  const hazmatAlerts: AlertItem[] = drivers.filter(d => {
    if (!d.hazmat_expiry) return false;
    const expDate = parseISO(d.hazmat_expiry);
    return isBefore(expDate, in30Days);
  }).map(d => ({
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    subtitle: 'HAZMAT Certification',
    date: d.hazmat_expiry!,
    isExpired: isBefore(parseISO(d.hazmat_expiry!), today)
  }));

  // Trucks that are down
  const downTrucks = trucks.filter(t => t.status === 'down' || t.status === 'out_of_service');

  const totalDriverAlerts = licenseAlerts.length + medicalAlerts.length + hazmatAlerts.length;
  const openIncidents = incidents.filter(i => i.status === 'reported' || i.status === 'under_review').length;

  const trucksNeedingAttention = inspectionAlerts.length + downTrucks.length;
  const anyExpired = [...licenseAlerts, ...medicalAlerts, ...hazmatAlerts].some((a) => a.isExpired);

  // One list of everything due within 30 days, soonest first, in place of five tabs.
  const attention = [
    ...inspectionAlerts.map((a) => ({ ...a, what: 'Truck inspection', who: `Unit ${a.name}` })),
    ...licenseAlerts.map((a) => ({ ...a, what: 'CDL', who: a.name })),
    ...medicalAlerts.map((a) => ({ ...a, what: 'DOT medical card', who: a.name })),
    ...hazmatAlerts.map((a) => ({ ...a, what: 'Hazmat certification', who: a.name })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageHeader title="Safety" description="Inspections, driver credentials, incidents and alerts" />

      <Panel title="Needs attention" className="mb-5">
        <StatementLine
          label="Trucks"
          note={`${inspectionAlerts.length} ${inspectionAlerts.length === 1 ? 'inspection' : 'inspections'} due within 30 days, ${downTrucks.length} down`}
          value={trucksNeedingAttention}
          tone={downTrucks.length > 0 ? 'bad' : undefined}
        />
        <StatementLine
          label="Driver credentials to renew"
          note="CDL, medical card and hazmat, due within 30 days"
          value={totalDriverAlerts}
          rule="single"
          tone={anyExpired ? 'bad' : undefined}
        />
        <StatementLine
          label="Open incidents"
          note="Reported or under review"
          value={openIncidents}
          rule="single"
          tone={openIncidents > 0 ? 'bad' : undefined}
        />
        <StatementLine
          label="Trucks running"
          note={downTrucks.length === 0 ? 'Every truck is operational.' : `${downTrucks.length} down or out of service`}
          value={`${trucks.length - downTrucks.length} of ${trucks.length}`}
          strong
          rule="double"
          tone={downTrucks.length === 0 ? 'good' : 'bad'}
        />
      </Panel>

      <Panel title="Due within 30 days" description="Everything that is expired or about to be, soonest first." className="mb-5">
        {attention.length === 0 && downTrucks.length === 0 ? (
          <p className="border-t py-4 text-sm text-muted-foreground">Nothing needs attention. Inspections and credentials are current.</p>
        ) : (
          <div className="border-t">
            {downTrucks.map((truck, i) => (
              <StatementLine
                key={`down-${truck.id}`}
                label={`Unit ${truck.unit_number}`}
                note={[truck.make, truck.model].filter(Boolean).join(' ') || 'Truck'}
                value={<span className="text-base"><StatusBadge status={truck.status} /></span>}
                rule={i > 0 ? 'single' : undefined}
              />
            ))}
            {attention.map((item, i) => {
              const days = differenceInCalendarDays(parseISO(item.date), today);
              return (
                <StatementLine
                  key={item.id + item.what}
                  label={item.who}
                  note={`${item.what}, ${format(parseISO(item.date), 'MMM d, yyyy')}`}
                  value={<span className="text-base">{item.isExpired ? `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago` : `In ${days} ${days === 1 ? 'day' : 'days'}`}</span>}
                  tone={item.isExpired ? 'bad' : undefined}
                  rule={i > 0 || downTrucks.length > 0 ? 'single' : undefined}
                />
              );
            })}
          </div>
        )}
      </Panel>

      <DriverComplianceHub />

      {incidents.length > 0 && (
        <Panel title="Incidents, last 6 months" description="Monthly count, with critical and major incidents shown separately." className="mb-5">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <IncidentTrendsChart data={incidentTrends} config={trendChartConfig} />
          </Suspense>
        </Panel>
      )}

      <NewWorkOrderSheet
        open={workOrderOpen}
        onOpenChange={setWorkOrderOpen}
        initialData={workOrderInitialData}
      />
    </>
  );
}
