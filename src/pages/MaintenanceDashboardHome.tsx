import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { PageHeader } from '@/components/shared/PageHeader';
import { NewWorkOrderSheet } from '@/components/maintenance/NewWorkOrderSheet';
import {
  useFleetAvailability,
  useActiveWorkOrders,
  useTodaysWorkOrders,
  useStartWorkOrder,
  type TodayUrgency,
  type TodaysWorkOrder,
} from '@/hooks/useMaintenanceData';
import { useDriverFaultReports, type DriverFaultReport } from '@/hooks/useDriverFaultReports';
import { usePMNotifications, type PMNotification } from '@/hooks/usePMNotifications';
import { useToast } from '@/hooks/use-toast';
import {
  Truck,
  Wrench,
  AlertTriangle,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  PlayCircle,
  Calendar,
  Zap,
  Plus,
  Package,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { subDays, addDays, format, formatDistanceToNow } from 'date-fns';


type Trend = {
  direction: 'up' | 'down' | 'flat';
  label: string;
  positive: boolean;
};

interface KPICardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  helper: string;
  trend?: Trend;
  loading?: boolean;
  accentClass?: string;
}

function KPICard({ title, icon: Icon, value, helper, trend, loading, accentClass }: KPICardProps) {
  return (
    <Card className={cn(accentClass)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-[100px]" />
        ) : (
          <>
            <div className="text-2xl sm:text-3xl font-bold truncate">{value}</div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              {trend && trend.direction !== 'flat' && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 font-medium',
                    trend.positive ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {trend.direction === 'up' ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {trend.label}
                </span>
              )}
              <span className="text-muted-foreground">
                {trend && trend.direction !== 'flat' ? '·' : ''} {helper}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

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

function FleetUptimeCard() {
  const { data, isLoading } = useFleetAvailability();
  const total = data?.total || 0;
  const available = data?.available || 0;
  const uptime = total > 0 ? (available / total) * 100 : 0;
  const meetsTarget = uptime >= 95;

  return (
    <KPICard
      title="Fleet Uptime"
      icon={Truck}
      loading={isLoading}
      value={`${uptime.toFixed(1)}%`}
      helper={`${available}/${total} trucks available`}
      trend={{
        direction: meetsTarget ? 'up' : 'down',
        label: meetsTarget ? 'On target' : `${(95 - uptime).toFixed(1)}% below`,
        positive: meetsTarget,
      }}
      accentClass={!meetsTarget ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : undefined}
    />
  );
}

function OpenWorkOrdersCard() {
  const { data, isLoading } = useActiveWorkOrders();
  const sevenDaysAgo = subDays(new Date(), 7);
  const recent = (data || []).filter(wo => new Date(wo.entry_date + 'T00:00:00') >= sevenDaysAgo).length;
  const total = data?.length || 0;
  const direction: Trend['direction'] = recent === 0 ? 'flat' : 'up';

  return (
    <KPICard
      title="Open Work Orders"
      icon={Wrench}
      loading={isLoading}
      value={String(total)}
      helper="Active right now"
      trend={{
        direction,
        label: `${recent} new (7d)`,
        positive: recent === 0,
      }}
    />
  );
}

function CriticalDriverReportsCard() {
  const { data, isLoading } = useDriverFaultReports();
  const critical = (data || []).filter(r => r.priority === 'critical' || r.priority === 'high').length;
  const hasCritical = critical > 0;

  return (
    <KPICard
      title="Critical Driver Reports"
      icon={AlertTriangle}
      loading={isLoading}
      value={String(critical)}
      helper={hasCritical ? 'Needs immediate action' : 'All clear'}
      trend={{
        direction: hasCritical ? 'up' : 'flat',
        label: hasCritical ? 'Urgent' : 'No alerts',
        positive: !hasCritical,
      }}
      accentClass={hasCritical ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : undefined}
    />
  );
}

function AvgRepairTurnaroundCard() {
  const { data, isLoading } = useAvgRepairTurnaround();
  const hours = data?.currentHours || 0;
  const prior = data?.priorHours || 0;

  const formatTime = (h: number) => {
    if (h <= 0) return '—';
    if (h < 48) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  };

  const delta = prior > 0 ? hours - prior : 0;
  const improving = delta < 0;
  const direction: Trend['direction'] = prior === 0 || Math.abs(delta) < 0.5 ? 'flat' : improving ? 'down' : 'up';

  return (
    <KPICard
      title="Avg. Repair Turnaround"
      icon={Clock}
      loading={isLoading}
      value={formatTime(hours)}
      helper={`Last 30d · ${data?.count || 0} jobs`}
      trend={{
        direction,
        label: prior > 0 ? `${Math.abs(delta).toFixed(1)}h vs prior` : 'No prior data',
        positive: improving,
      }}
    />
  );
}

function UrgencyBadge({ urgency }: { urgency: TodayUrgency }) {
  if (urgency === 'high') return <Badge variant="destructive">High</Badge>;
  if (urgency === 'medium')
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
        Medium
      </Badge>
    );
  return <Badge variant="secondary">Low</Badge>;
}

function TodaysPrioritiesCard() {
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
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Today's Priorities</CardTitle>
          {!isLoading && (
            <Badge variant="secondary" className="ml-1">{items.length}</Badge>
          )}
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
          <Link to="/maintenance">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-sm text-muted-foreground">No work orders scheduled for today.</p>
            <Button asChild variant="link" size="sm" className="mt-1">
              <Link to="/maintenance">Schedule one →</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Truck</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead className="w-[110px]">Urgency</TableHead>
                <TableHead className="w-[130px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(wo => {
                const isInProgress = wo.status === 'in_progress';
                const issue = wo.description || wo.service_type || '—';
                return (
                  <TableRow
                    key={wo.id}
                    onClick={() => navigate('/maintenance')}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      {wo.trucks?.unit_number ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      <span className="line-clamp-1 text-sm">{issue}</span>
                    </TableCell>
                    <TableCell>
                      <UrgencyBadge urgency={wo.urgency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <LoadingButton
                        size="sm"
                        variant={isInProgress ? 'secondary' : 'default'}
                        disabled={isInProgress}
                        loading={startMutation.isPending && startMutation.variables === wo.id}
                        onClick={(e) => handleStart(e, wo)}
                        className="gap-1"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        {isInProgress ? 'In Progress' : 'Start Work'}
                      </LoadingButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function priorityBadge(priority: DriverFaultReport['priority']) {
  if (priority === 'critical' || priority === 'high')
    return <Badge variant="destructive" className="capitalize">{priority}</Badge>;
  if (priority === 'medium')
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 capitalize">
        {priority}
      </Badge>
    );
  return <Badge variant="secondary" className="capitalize">{priority}</Badge>;
}

function LiveDriverAlertsCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useDriverFaultReports();
  const alerts = (data || []).filter(r => r.status === 'submitted').slice(0, 6);

  return (
    <Card className="border-destructive/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-destructive/20 bg-destructive/5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <div>
            <CardTitle className="text-base">Live Driver Alerts</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Unverified — needs triage
            </p>
          </div>
        </div>
        {!isLoading && alerts.length > 0 && (
          <Badge variant="destructive">{alerts.length}</Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-sm text-muted-foreground">No new driver alerts.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {alerts.map(r => {
              const driver = `${r.drivers?.first_name ?? ''} ${r.drivers?.last_name ?? ''}`.trim() || 'Driver';
              return (
                <li
                  key={r.id}
                  onClick={() => navigate('/maintenance')}
                  className="cursor-pointer px-4 py-3 transition-colors hover:bg-destructive/5"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {priorityBadge(r.priority)}
                      <span className="text-sm font-medium truncate">
                        {r.trucks?.unit_number ?? '—'} · {driver}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    <span className="capitalize font-medium text-foreground/80">{r.issue_type}</span>
                    {' — '}
                    {r.description}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t px-4 py-2 text-right">
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/maintenance">
              View all driver reports <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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

function UpcomingPMCard() {
  const navigate = useNavigate();
  const { data, isLoading } = usePMNotifications();
  const items = buildUpcomingItems(data || []);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Upcoming Preventive Maintenance</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Next 7 days</p>
          </div>
          {!isLoading && (
            <Badge variant="secondary" className="ml-1">{items.length}</Badge>
          )}
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
          <Link to="/maintenance?tab=predictive">
            Calendar <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-sm text-muted-foreground">
              No preventive maintenance due in the next 7 days.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Truck</TableHead>
                <TableHead>Service Type</TableHead>
                <TableHead className="w-[180px]">Due Date</TableHead>
                <TableHead className="w-[130px] text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow
                  key={item.id}
                  onClick={() => navigate('/maintenance?tab=predictive')}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <TableCell className="font-medium">{item.truckLabel}</TableCell>
                  <TableCell>
                    <span className="text-sm">{item.serviceName}</span>
                    {item.notification.service_code && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({item.notification.service_code})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-sm',
                        item.isOverdue
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : item.isImminent
                          ? 'text-amber-600 dark:text-amber-400 font-medium'
                          : 'text-muted-foreground',
                      )}
                    >
                      {item.isOverdue ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : item.isImminent ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <Calendar className="h-3.5 w-3.5" />
                      )}
                      {item.dueLabel}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.isOverdue ? (
                      <Badge variant="destructive">Overdue</Badge>
                    ) : item.isImminent ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                        Due soon
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Upcoming</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

interface QuickActionsCardProps {
  onCreateWorkOrder: () => void;
  onLogParts: () => void;
}

function QuickActionsCard({ onCreateWorkOrder, onLogParts }: QuickActionsCardProps) {
  const navigate = useNavigate();

  const actions = [
    {
      key: 'create-wo',
      label: 'Create New Work Order',
      helper: 'Open a new repair or PM job',
      icon: Plus,
      variant: 'default' as const,
      onClick: onCreateWorkOrder,
    },
    {
      key: 'log-parts',
      label: 'Log Parts Usage',
      helper: 'Add parts & costs to a work order',
      icon: Package,
      variant: 'secondary' as const,
      onClick: onLogParts,
    },
    {
      key: 'message-driver',
      label: 'Message a Driver',
      helper: 'Open driver fault report threads',
      icon: MessageSquare,
      variant: 'secondary' as const,
      onClick: () => navigate('/maintenance'),
    },
    {
      key: 'truck-status',
      label: 'Update Truck Status',
      helper: 'Mark trucks active, in-shop or down',
      icon: Truck,
      variant: 'outline' as const,
      onClick: () => navigate('/trucks'),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Zap className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map(a => (
          <Button
            key={a.key}
            variant={a.variant}
            onClick={a.onClick}
            className="w-full justify-start gap-3 h-auto py-3"
          >
            <a.icon className="h-4 w-4 shrink-0" />
            <span className="flex flex-col items-start text-left">
              <span className="text-sm font-semibold leading-tight">{a.label}</span>
              <span className={cn(
                'text-[11px] font-normal mt-0.5',
                a.variant === 'default' ? 'text-primary-foreground/80' : 'text-muted-foreground',
              )}>
                {a.helper}
              </span>
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export default function MaintenanceDashboardHome() {
  const [woOpen, setWoOpen] = useState(false);


  return (
    <>
      <PageHeader
        title="Maintenance Dashboard"
        description="Performance & status overview for your fleet maintenance operations"
      >
        <Button asChild variant="outline" className="gap-2">
          <Link to="/maintenance">
            Open Maintenance Management
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold tracking-tight mb-3">
            Performance & Status Overview
          </h2>
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <FleetUptimeCard />
            <OpenWorkOrdersCard />
            <CriticalDriverReportsCard />
            <AvgRepairTurnaroundCard />
          </div>
        </section>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          <TodaysPrioritiesCard />
          <LiveDriverAlertsCard />
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          <UpcomingPMCard />
          <QuickActionsCard />
        </div>
      </div>
    </>
  );
}

