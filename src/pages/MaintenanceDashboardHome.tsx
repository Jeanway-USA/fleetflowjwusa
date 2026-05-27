import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { DriverFaultReportsPanel } from '@/components/maintenance/DriverFaultReportsPanel';
import { PMNotificationsPanel } from '@/components/maintenance/PMNotificationsPanel';
import {
  useFleetAvailability,
  useActiveWorkOrders,
} from '@/hooks/useMaintenanceData';
import { useDriverFaultReports } from '@/hooks/useDriverFaultReports';
import {
  Truck,
  Wrench,
  AlertTriangle,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { subDays } from 'date-fns';

type Trend = {
  direction: 'up' | 'down' | 'flat';
  label: string;
  /** When true, treat the direction as positive (green); otherwise it's negative (red). */
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
  const improving = delta < 0; // less time = better
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

export default function MaintenanceDashboardHome() {
  const navigate = useNavigate();
  const handleViewTruck = () => navigate('/maintenance');

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
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Driver Fault Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <DriverFaultReportsPanel onViewTruck={handleViewTruck} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">PM Notifications</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <PMNotificationsPanel />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
