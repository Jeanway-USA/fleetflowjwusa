import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ClipboardList, MessageSquare, Package, Users, Wallet, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAcknowledgeFaultReport, useConvertFaultReportToWorkOrder, useDriverFaultReports } from '@/hooks/useDriverFaultReports';
import { MaintenanceThread } from '@/components/maintenance/MaintenanceThread';
import { usePMNotifications } from '@/hooks/usePMNotifications';
import { useCostPerMile, useLowStockParts, useMaintenanceCostMTD } from '@/hooks/useMaintenanceData';
import { useShopCrew } from '@/hooks/useShop';
import { NewJobSheet } from '@/components/shop/NewJobSheet';
import { Initials, ShopEmpty } from '@/components/shop/shared';
import { jobTitle, money, type ShopJob } from '@/lib/shop/board';

function Block({ icon: Icon, title, count, children, tone }: { icon: typeof Wrench; title: string; count?: number; children: React.ReactNode; tone?: string }) {
  return (
    <section className="rounded-2xl border bg-card p-3.5">
      <header className="mb-2.5 flex items-center gap-2">
        <Icon className={cn('h-4 w-4', tone ?? 'text-muted-foreground')} />
        <h2 className="font-condensed text-lg font-bold leading-none">{title}</h2>
        {count !== undefined && count > 0 && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{count}</span>}
      </header>
      {children}
    </section>
  );
}

/** Everything that needs a decision or a heads-up, so nothing waits on someone remembering. */
export function HeadsUpRail({ jobs, partsPath }: { jobs: ShopJob[]; partsPath: string }) {
  const reports = useDriverFaultReports();
  const convert = useConvertFaultReportToWorkOrder();
  const ack = useAcknowledgeFaultReport();
  const cost = useMaintenanceCostMTD();
  const cpm = useCostPerMile();
  const [threadFor, setThreadFor] = useState<string | null>(null);
  const pm = usePMNotifications();
  const low = useLowStockParts();
  const { data: crew = [] } = useShopCrew();
  const [pmJob, setPmJob] = useState<{ truckId: string; description: string } | null>(null);

  const newReports = (reports.data ?? []).filter((r) => r.status === 'submitted' || r.status === 'acknowledged');
  const pmList = (pm.data ?? []).filter((n) => n.notification_type !== 'upcoming').slice(0, 5);
  const lowList = (low.data ?? []).slice(0, 5);

  const onClock = (name: string) => jobs.find((j) => j.runningTimer?.userName === name || j.assignedName === name);

  return (
    <aside className="space-y-3">
      <Block icon={AlertTriangle} title="Driver reports" count={newReports.length} tone="text-orange-400">
        {newReports.length === 0 ? (
          <p className="text-xs text-muted-foreground">No new reports from drivers.</p>
        ) : (
          <ul className="space-y-2">
            {newReports.slice(0, 4).map((r) => (
              <li key={r.id} className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-sm font-medium">
                  Unit {r.trucks?.unit_number ?? '?'} <span className="font-normal capitalize text-muted-foreground">· {r.issue_type}</span>
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}{r.status === 'acknowledged' ? ' · seen' : ''}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Button size="sm" className="h-9" disabled={convert.isPending} onClick={() => convert.mutate(r, { onSuccess: () => toast.success('Job created from the report.'), onError: (e: any) => toast.error(e.message) })}>Make a job</Button>
                  <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => setThreadFor(threadFor === r.id ? null : r.id)}><MessageSquare className="h-3.5 w-3.5" />Reply</Button>
                  {r.status === 'submitted' && <Button size="sm" variant="ghost" className="h-9" disabled={ack.isPending} onClick={() => ack.mutate(r.id, { onError: (e: any) => toast.error(e.message) })}>Got it</Button>}
                </div>
                {threadFor === r.id && <div className="mt-2 rounded-lg border bg-background p-2"><MaintenanceThread requestId={r.id} viewerRole="maintenance" /></div>}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block icon={ClipboardList} title="Service due" count={pmList.length} tone="text-amber-300">
        {pmList.length === 0 ? (
          <p className="text-xs text-muted-foreground">No service coming due.</p>
        ) : (
          <ul className="space-y-1.5">
            {pmList.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">Unit {n.trucks?.unit_number ?? '?'}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {n.service_name} · {n.notification_type === 'overdue' ? 'overdue' : 'due soon'}
                  </span>
                </span>
                <Button size="sm" variant="outline" className="h-9" onClick={() => setPmJob({ truckId: n.truck_id, description: `${n.service_name} is ${n.notification_type === 'overdue' ? 'overdue' : 'due soon'}` })}>
                  Schedule
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block icon={Package} title="Low on stock" count={lowList.length} tone="text-red-400">
        {lowList.length === 0 ? (
          <p className="text-xs text-muted-foreground">Shelves are stocked.</p>
        ) : (
          <ul className="space-y-1.5">
            {lowList.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{p.part_name}</span>
                <span className={cn('shrink-0 tabular-nums text-xs font-semibold', Number(p.quantity_on_hand) === 0 ? 'text-red-400' : 'text-orange-300')}>
                  {Number(p.quantity_on_hand)} left / min {Number(p.min_threshold)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link to={partsPath} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open the parts room</Link>
      </Block>

      <Block icon={Wallet} title="This month">
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-muted/50 p-2.5"><dt className="text-xs text-muted-foreground">Spent on the fleet</dt><dd className="font-condensed text-2xl font-bold tabular-nums">{cost.data == null ? '—' : money(cost.data)}</dd></div>
          <div className="rounded-xl bg-muted/50 p-2.5"><dt className="text-xs text-muted-foreground">Cost per mile</dt><dd className="font-condensed text-2xl font-bold tabular-nums">{cpm.data == null ? '—' : `$${cpm.data.toFixed(3)}`}</dd></div>
        </dl>
      </Block>

      <Block icon={Users} title="Crew">
        {crew.length === 0 ? (
          <ShopEmpty icon={Users} title="No crew yet">Add people with the Maintenance role under Settings, Team.</ShopEmpty>
        ) : (
          <ul className="space-y-2">
            {crew.map((c) => {
              const j = onClock(c.name);
              return (
                <li key={c.id} className="flex items-center gap-2.5 text-sm">
                  <Initials name={c.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{j ? `Unit ${j.unit}, ${jobTitle(j)}` : 'Free'}</span>
                  </span>
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', j?.runningTimer?.userName === c.name ? 'bg-primary' : j ? 'bg-slate-400' : 'bg-emerald-500')} />
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      <NewJobSheet open={!!pmJob} onOpenChange={(v) => !v && setPmJob(null)} truckId={pmJob?.truckId} description={pmJob?.description} />
    </aside>
  );
}
