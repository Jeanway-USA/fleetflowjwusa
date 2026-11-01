import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatStrip } from '@/components/shared/StatStrip';
import { EmptyState } from '@/components/shared/EmptyState';
import { Panel } from '@/components/finance/statement-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DriverStandards, driverRows } from '@/components/safety/DriverStandards';
import { EquipmentStandards, equipmentRows } from '@/components/safety/EquipmentStandards';
import { IncidentRegister } from '@/components/safety/IncidentRegister';
import { RequirementsReference } from '@/components/safety/RequirementsReference';
import { STATUS_UI } from '@/components/safety/CheckList';
import { useSafetyData } from '@/hooks/useSafetyData';
import { todayLocal } from '@/lib/datetime';
import { accidentsToReview, needsAction } from '@/lib/safety/compliance';
import { cn } from '@/lib/utils';

const TABS = ['overview', 'drivers', 'equipment', 'incidents', 'requirements'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', drivers: 'Drivers', equipment: 'Equipment', incidents: 'Incidents', requirements: 'Requirements' };
const SEVERITY = { overdue: 5, missing: 4, review: 3, soon: 2, ok: 1, info: 0 } as const;

/**
 * Safety and compliance: drivers and equipment against Landstar's minimums and the DOT rules, the accident register, and a plain
 * list of what each requires. Landstar keeps the official driver files; this page tracks what JeanWay has to keep current.
 */
export default function Safety() {
  const { orgId, user, isOwner, hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const setTab = (t: string) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const canEdit = isOwner || hasRole('safety');
  const today = todayLocal();
  const data = useSafetyData();

  const drivers = useMemo(() => driverRows(data.drivers.filter((d) => d.status === 'active'), data.files, data.incidents, today), [data.drivers, data.files, data.incidents, today]);
  const equipment = useMemo(() => equipmentRows(data.trucks, data.trailers, data.files, today), [data.trucks, data.trailers, data.files, today]);

  // One list of everything that needs a hand, worst first.
  const todo = useMemo(() => [
    ...drivers.flatMap((r) => r.checks.filter((c) => needsAction(c.status)).map((c) => ({ who: r.name, tab: 'drivers' as const, check: c }))),
    ...equipment.flatMap((r) => r.checks.filter((c) => needsAction(c.status)).map((c) => ({ who: r.title, tab: 'equipment' as const, check: c }))),
  ].sort((a, b) => SEVERITY[b.check.status] - SEVERITY[a.check.status] || (a.check.date ?? '9999').localeCompare(b.check.date ?? '9999')), [drivers, equipment]);

  const driversToFix = drivers.filter((r) => r.checks.some((c) => needsAction(c.status))).length;
  const equipmentToFix = equipment.filter((r) => r.checks.some((c) => needsAction(c.status))).length;
  const overdue = todo.filter((t) => t.check.status === 'overdue' || t.check.status === 'missing').length;
  const toReview = data.drivers.filter((d) => d.status === 'active').reduce((n, d) => n + accidentsToReview(data.incidents, d.id, today).length, 0);

  if (data.error) {
    return (
      <>
        <PageHeader title="Safety" description="Compliance with Landstar, DOT and FMCSA" />
        <EmptyState icon={Loader2} title="Safety could not load" description={data.error.message} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Safety" description="Compliance with Landstar, DOT and FMCSA: drivers, equipment and accidents" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start">
          {TABS.map((t) => <TabsTrigger key={t} value={t} className="h-10">{TAB_LABEL[t]}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-5">
          {data.loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
            <>
              <StatStrip cells={[
                { label: 'Drivers to fix', value: `${driversToFix} of ${drivers.length}`, note: 'active drivers' },
                { label: 'Equipment to fix', value: `${equipmentToFix} of ${equipment.length}`, note: 'trucks and trailers' },
                { label: 'Overdue or missing', value: String(overdue) },
                { label: 'Accidents to review', value: String(toReview), note: 'last 12 months' },
              ]} />

              <Panel title="Needs attention" description="Everything overdue, missing, due within 30 days, or waiting for a decision. Worst first.">
                {todo.length === 0 ? (
                  <p className="border-t py-4 text-sm text-muted-foreground">Nothing needs attention. Every active driver and every truck and trailer is current.</p>
                ) : (
                  <ul className="divide-y border-t">
                    {todo.map((t, i) => {
                      const ui = STATUS_UI[t.check.status];
                      return (
                        <li key={`${t.who}-${t.check.key}-${i}`}>
                          <button type="button" onClick={() => setTab(t.tab)} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 py-3 text-left hover:bg-accent/50">
                            <span className="min-w-[8rem] font-medium">{t.who}</span>
                            <span className="text-sm">{t.check.label}</span>
                            <span className={cn('text-xs font-medium', ui.text)}>{ui.label}</span>
                            <span className="basis-full text-sm text-muted-foreground">{t.check.detail}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Who handles what">
                <ul className="space-y-2 border-t pt-3 text-sm">
                  <li><span className="font-medium">Landstar keeps</span> the official driver qualification files, the drug and alcohol program, Clearinghouse queries, and approves every driver. Its operator minimums were last confirmed as valid on July 1, 2026.</li>
                  <li><span className="font-medium">JeanWay keeps</span> licenses, medical cards and hazmat current, a copy of each MVR, equipment inspected every 120 days, and the accident record.</li>
                  <li className="text-muted-foreground">The Requirements tab lists every rule, who handles it, and where it comes from.</li>
                </ul>
              </Panel>
            </>
          )}
        </TabsContent>

        <TabsContent value="drivers" className="mt-0">
          <DriverStandards drivers={data.drivers} files={data.files} filesReady={data.filesReady} incidents={data.incidents} today={today} canEdit={canEdit} orgId={orgId} userId={user?.id ?? null} />
        </TabsContent>

        <TabsContent value="equipment" className="mt-0">
          <EquipmentStandards trucks={data.trucks} trailers={data.trailers} files={data.files} filesReady={data.filesReady} today={today} canEdit={canEdit} orgId={orgId} userId={user?.id ?? null} />
        </TabsContent>

        <TabsContent value="incidents" className="mt-0">
          <IncidentRegister incidents={data.incidents} drivers={data.drivers} trucks={data.trucks} />
        </TabsContent>

        <TabsContent value="requirements" className="mt-0">
          <RequirementsReference />
        </TabsContent>
      </Tabs>
    </>
  );
}
