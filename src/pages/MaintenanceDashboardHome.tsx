import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Panel } from '@/components/shared/Panel';
import { StatStrip } from '@/components/shared/StatStrip';
import { NewWorkOrderSheet } from '@/components/maintenance/NewWorkOrderSheet';
import { LogPartsUsageDialog } from '@/components/maintenance/LogPartsUsageDialog';
import { MessageDriverDialog } from '@/components/maintenance/MessageDriverDialog';
import { UpdateTruckStatusDialog } from '@/components/maintenance/UpdateTruckStatusDialog';
import {
  useFleetAvailability,
  useActiveWorkOrders,
  useTodaysWorkOrders,
  useStartWorkOrder,
  useLowStockParts,
  useRequestReorder,
  type TodayUrgency,
  type TodaysWorkOrder,
  type PartInventoryItem,
} from '@/hooks/useMaintenanceData';
import { useDriverFaultReports } from '@/hooks/useDriverFaultReports';
import { usePMNotifications, type PMNotification } from '@/hooks/usePMNotifications';
import { useToast } from '@/hooks/use-toast';
import { Truck, ChevronRight, PlayCircle, Plus, Package, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { subDays, addDays, format, formatDistanceToNow } from 'date-fns';

function useAvgRepairTurnaround() {
  return useQuery({
    queryKey: ['avg-repair-turnaround'],
    queryFn: async () => {
      const now = new Date();
      const since = subDays(now, 30).toISOString();
      const priorSince = subDays(now, 60).toISOString();

      const { data, error } = await supabase
        .from('work_orders')
        .select('entry_date, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', priorSince)
        .not('completed_at', 'is', null);

      if (error) throw error;

      const avgHours = (rows: { entry_date: string; completed_at: string | null }[]) => {
        if (!rows.length) return 0;
        const total = rows.reduce((s, r) => {
          if (!r.completed_at) return s;
          const start = new Date(r.entry_date + 'T00:00:00').getTime();
          const end = new Date(r.completed_at).getTime();
          return s + Math.max(0, (end - start) / (1000 * 60 * 60));
        }, 0);
        return total / rows.length;
      };

      const current = (data || []).filter(r => r.completed_at && r.completed_at >= since);
      const prior = (data || []).filter(
        r => r.completed_at && r.completed_at < since && r.completed_at >= priorSince,
      );

      return { currentHours: avgHours(current), priorHours: avgHours(prior), count: current.length };
    },
  });
}

interface UpcomingPMItem {
  id: string;
  truckLabel: string;
  serviceName: string;
  notification: PMNotification;
  isOverdue: boolean;
  isImminent: boolean; // <= 48h
  dueLabel: string;
  sortKey: number;
}

function buildUpcomingItems(list: PMNotification[]): UpcomingPMItem[] {
  const today = new Date();
  const items: UpcomingPMItem[] = [];

  for (const n of list) {
    const remaining = n.days_or_miles_remaining;
    const isOverdueType = n.notification_type === 'overdue';

    if (n.unit === 'days' && remaining !== null) {
      if (remaining > 7) continue;
      const dueDate = addDays(today, remaining);
      const isOverdue = remaining < 0 || isOverdueType;
      const isImminent = !isOverdue && remaining <= 2;
      items.push({
        id: n.id,
        truckLabel: n.trucks?.unit_number || 'Unknown',
        serviceName: n.service_name,
        notification: n,
        isOverdue,
        isImminent,
        dueLabel: isOverdue
          ? `Overdue · ${format(dueDate, 'MMM d')}`
          : format(dueDate, 'MMM d'),
        sortKey: remaining,
      });
    } else if (n.unit === 'miles' && (isOverdueType || n.notification_type === 'due_soon') && remaining !== null) {
      const isOverdue = isOverdueType || remaining < 0;
      items.push({
        id: n.id,
        truckLabel: n.trucks?.unit_number || 'Unknown',
        serviceName: n.service_name,
        notification: n,
        isOverdue,
        isImminent: false,
        dueLabel: isOverdue
          ? `Overdue · ${Math.abs(remaining).toLocaleString()} mi`
          : `in ${remaining.toLocaleString()} mi`,
        sortKey: isOverdue ? -9999 : 100 + remaining / 10000,
      });
    }
  }

  return items.sort((a, b) => a.sortKey - b.sortKey);
}

function formatTurnaround(h: number) {
  if (h <= 0) return 'n/a';
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

/** The shop's headline numbers in one ruled strip. */
function ShopStatus() {
  const fleet = useFleetAvailability();
  const open = useActiveWorkOrders();
  const reports = useDriverFaultReports();
  const turnaround = useAvgRepairTurnaround();

  const total = fleet.data?.total || 0;
  const available = fleet.data?.available || 0;
  const uptime = total > 0 ? (available / total) * 100 : 0;

  const sevenDaysAgo = subDays(new Date(), 7);
  const openCount = open.data?.length || 0;
  const newThisWeek = (open.data || []).filter(wo => new Date(wo.entry_date + 'T00:00:00') >= sevenDaysAgo).length;

  const urgentReports = (reports.data || []).filter(r => r.priority === 'critical' || r.priority === 'high').length;

  const hours = turnaround.data?.currentHours || 0;
  const prior = turnaround.data?.priorHours || 0;
  const delta = prior > 0 ? hours - prior : 0;

  return (
    <StatStrip
      isLoading={fleet.isLoading || open.isLoading || reports.isLoading || turnaround.isLoading}
      cells={[
        {
          label: 'Trucks ready',
          value: `${available} of ${total}`,
          note: `${uptime.toFixed(0)}% uptime${uptime < 95 && total > 0 ? ', below 95% target' : ''}`,
          problem: total > 0 && uptime < 95,
        },
        {
          label: 'Open work orders',
          value: openCount,
          note: newThisWeek > 0 ? `${newThisWeek} new this week` : 'None new this week',
        },
        {
          label: 'Urgent driver reports',
          value: urgentReports,
          note: urgentReports > 0 ? 'Needs triage now' : 'All clear',
          problem: urgentReports > 0,
        },
        {
          label: 'Avg repair time',
          value: formatTurnaround(hours),
          // Only compare when both periods actually finished jobs; zero jobs is not "faster".
          note: hours <= 0
            ? 'No jobs finished in 30 days'
            : prior > 0 && Math.abs(delta) >= 0.5
              ? `${delta < 0 ? 'Faster' : 'Slower'} by ${Math.abs(delta).toFixed(1)}h than last month`
              : `${turnaround.data?.count || 0} jobs, last 30 days`,
        },
      ]}
    />
  );
}

function urgencyText(urgency: TodayUrgency) {
  if (urgency === 'high') return <span className="font-semibold text-destructive">High</span>;
  if (urgency === 'medium') return <span className="font-semibold">Medium</span>;
  return <span className="text-muted-foreground">Low</span>;
}

function TodaysJobs() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useTodaysWorkOrders();
  const startMutation = useStartWorkOrder();
  const items = data || [];

  const handleStart = (e: React.MouseEvent, wo: TodaysWorkOrder) => {
    e.stopPropagation();
    startMutation.mutate(wo.id, {
      onSuccess: () => toast({ title: 'Work started', description: `Truck ${wo.trucks?.unit_number ?? ''} is now in progress.` }),
      onError: (err: any) => toast({ title: 'Failed to start', description: err?.message ?? 'Try again', variant: 'destructive' }),
    });
  };

  return (
    <Panel
      title="Today's jobs"
      aside={items.length > 0 ? `${items.length} scheduled` : undefined}
      link={{ to: '/maintenance', label: 'All work orders' }}
      isLoading={isLoading}
      isEmpty={items.length === 0}
      empty={<>Nothing scheduled for today. <Link to="/maintenance?action=new-work-order" className="font-semibold text-primary underline">Schedule a job</Link></>}
      className="lg:col-span-2"
    >
      <ul className="divide-y border-t">
        {items.map(wo => {
          const inProgress = wo.status === 'in_progress';
          return (
            <li
              key={wo.id}
              onClick={() => navigate('/maintenance')}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-secondary/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="figure text-[17px] font-bold">Unit {wo.trucks?.unit_number ?? '?'}</span>
                  <span className="text-[13px]">{urgencyText(wo.urgency)}</span>
                </div>
                <p className="truncate text-[15px] text-muted-foreground">{wo.description || wo.service_type || 'No description'}</p>
              </div>
              <LoadingButton
                variant={inProgress ? 'secondary' : 'default'}
                disabled={inProgress}
                loading={startMutation.isPending && startMutation.variables === wo.id}
                onClick={(e) => handleStart(e, wo)}
                className="h-11 shrink-0 gap-1.5 sm:h-10"
              >
                <PlayCircle className="h-4 w-4" />
                {inProgress ? 'In progress' : 'Start work'}
              </LoadingButton>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function DriverReports() {
  const navigate = useNavigate();
  const { data, isLoading } = useDriverFaultReports();
  const alerts = (data || []).filter(r => r.status === 'submitted').slice(0, 6);
  const urgent = alerts.filter(r => r.priority === 'critical' || r.priority === 'high').length;

  return (
    <Panel
      title="Driver reports"
      aside={alerts.length > 0 ? (urgent > 0 ? `${urgent} urgent` : `${alerts.length} to triage`) : undefined}
      asideProblem={urgent > 0}
      link={{ to: '/maintenance', label: 'All reports' }}
      isLoading={isLoading}
      isEmpty={alerts.length === 0}
      empty="No new reports from drivers."
    >
      <ul className="divide-y border-t">
        {alerts.map(r => {
          const driver = `${r.drivers?.first_name ?? ''} ${r.drivers?.last_name ?? ''}`.trim() || 'Driver';
          const isUrgent = r.priority === 'critical' || r.priority === 'high';
          return (
            <li key={r.id} onClick={() => navigate('/maintenance')} className="cursor-pointer px-4 py-2.5 hover:bg-secondary/50">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">
                  Unit {r.trucks?.unit_number ?? '?'}, {driver}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                <span className={cn('font-semibold capitalize', isUrgent ? 'text-destructive' : 'text-foreground')}>
                  {r.priority}, {r.issue_type}:
                </span>{' '}
                {r.description}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function PMDueSoon() {
  const navigate = useNavigate();
  const { data, isLoading } = usePMNotifications();
  const items = buildUpcomingItems(data || []);
  const overdue = items.filter(i => i.isOverdue).length;

  return (
    <Panel
      title="PM due in 7 days"
      aside={items.length > 0 ? (overdue > 0 ? `${overdue} overdue` : `${items.length} due`) : undefined}
      asideProblem={overdue > 0}
      link={{ to: '/maintenance?tab=pm', label: 'PM schedule' }}
      isLoading={isLoading}
      isEmpty={items.length === 0}
      empty="No preventive maintenance due in the next 7 days."
      className="lg:col-span-2"
    >
      <ul className="divide-y border-t">
        {items.map(item => (
          <li
            key={item.id}
            onClick={() => navigate('/maintenance?tab=pm')}
            className="flex cursor-pointer items-baseline gap-3 px-4 py-2.5 hover:bg-secondary/50"
          >
            <span className="figure w-24 shrink-0 text-[17px] font-bold">Unit {item.truckLabel}</span>
            <span className="min-w-0 flex-1 truncate text-[15px]">
              {item.serviceName}
              {item.notification.service_code && <span className="text-muted-foreground"> ({item.notification.service_code})</span>}
            </span>
            <span
              className={cn(
                'shrink-0 text-sm tabular-nums',
                item.isOverdue ? 'font-semibold text-destructive' : item.isImminent ? 'font-semibold' : 'text-muted-foreground',
              )}
            >
              {item.dueLabel}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function LowStock() {
  const { toast } = useToast();
  const { data, isLoading } = useLowStockParts();
  const reorder = useRequestReorder();
  const parts = data || [];

  const handleReorder = (part: PartInventoryItem) => {
    reorder.mutate(part.id, {
      onSuccess: () => toast({ title: 'Reorder requested', description: `${part.part_name} flagged for purchasing.` }),
      onError: (err: any) => toast({ title: 'Reorder failed', description: err?.message ?? 'Try again', variant: 'destructive' }),
    });
  };

  const isRecentlyRequested = (iso: string | null) =>
    !!iso && Date.now() - new Date(iso).getTime() < 1000 * 60 * 60 * 24 * 7;

  return (
    <Panel
      title="Low stock"
      aside={parts.length > 0 ? `${parts.length} below minimum` : undefined}
      asideProblem={parts.length > 0}
      link={{ to: '/maintenance?tab=inventory', label: 'Inventory' }}
      isLoading={isLoading}
      isEmpty={parts.length === 0}
      empty="Every part is above its minimum."
    >
      <ul className="divide-y border-t">
        {parts.map(p => {
          const qty = Number(p.quantity_on_hand);
          const threshold = Number(p.min_threshold);
          const requested = isRecentlyRequested(p.reorder_requested_at);
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">
                  {p.part_name}
                  {p.part_number && <span className="font-normal text-muted-foreground"> {p.part_number}</span>}
                </div>
                <div className="text-sm tabular-nums">
                  <span className="font-semibold text-destructive">{qty} of {threshold} {p.unit}</span>
                  <span className="text-muted-foreground">
                    {p.vendor_name ? `, ${p.vendor_name}` : ''}
                    {p.last_restocked ? `, restocked ${formatDistanceToNow(new Date(p.last_restocked), { addSuffix: true })}` : ''}
                  </span>
                </div>
              </div>
              {requested ? (
                <span className="shrink-0 text-sm text-muted-foreground">Requested</span>
              ) : (
                <LoadingButton
                  variant="outline"
                  className="h-11 shrink-0 sm:h-10"
                  loading={reorder.isPending && reorder.variables === p.id}
                  onClick={() => handleReorder(p)}
                >
                  Reorder
                </LoadingButton>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ShopActions({ onLogParts, onMessageDriver, onUpdateTruck }: {
  onLogParts: () => void;
  onMessageDriver: () => void;
  onUpdateTruck: () => void;
}) {
  const actions = [
    { label: 'Log parts used', helper: 'Add parts and cost to a work order', icon: Package, onClick: onLogParts },
    { label: 'Message a driver', helper: 'Reply on a fault report thread', icon: MessageSquare, onClick: onMessageDriver },
    { label: 'Change truck status', helper: 'Mark a truck ready, in the shop, or down', icon: Truck, onClick: onUpdateTruck },
  ];
  return (
    <Panel title="Shop actions">
      <ul className="divide-y border-t">
        {actions.map(a => (
          <li key={a.label}>
            <button type="button" onClick={a.onClick} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-secondary/50">
              <a.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{a.label}</span>
                <span className="block text-[13px] text-muted-foreground">{a.helper}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function MaintenanceDashboardHome() {
  const [woOpen, setWoOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [truckOpen, setTruckOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-condensed text-[28px] font-bold leading-tight sm:text-[32px]">Shop</h1>
          <p className="text-[15px] text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
        <Button onClick={() => setWoOpen(true)} className="h-11 gap-2 sm:h-10">
          <Plus className="h-4 w-4" />
          New work order
        </Button>
      </div>

      <div className="space-y-4 lg:space-y-6">
        <ShopStatus />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <TodaysJobs />
          <DriverReports />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <PMDueSoon />
          <LowStock />
        </div>

        <ShopActions
          onLogParts={() => setPartsOpen(true)}
          onMessageDriver={() => setMessageOpen(true)}
          onUpdateTruck={() => setTruckOpen(true)}
        />
      </div>

      <NewWorkOrderSheet open={woOpen} onOpenChange={setWoOpen} />
      <LogPartsUsageDialog open={partsOpen} onOpenChange={setPartsOpen} />
      <MessageDriverDialog open={messageOpen} onOpenChange={setMessageOpen} />
      <UpdateTruckStatusDialog open={truckOpen} onOpenChange={setTruckOpen} />
    </>
  );
}
