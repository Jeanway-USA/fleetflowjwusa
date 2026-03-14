import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Truck, Users, Wrench, FileWarning } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface BriefingMetric {
  key: string;
  label: string;
  count: number;
  icon: React.ElementType;
  colorClass: string;
  route: string;
}

export function MorningBriefingWidget() {
  const { orgId } = useAuth();
  const navigate = useNavigate();

  const { data: metrics } = useQuery({
    queryKey: ['morning-briefing', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const today = format(new Date(), 'yyyy-MM-dd');
      const thirtyDaysOut = format(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        'yyyy-MM-dd'
      );

      const [loadsToday, expiringDrivers, overdueTrucks, missingPods] = await Promise.all([
        // Loads picking up today
        supabase
          .from('fleet_loads')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('pickup_date', today)
          .in('status', ['assigned', 'booked']),

        // Drivers with expiring docs in < 30 days
        supabase
          .from('drivers')
          .select('id, license_expiry, medical_card_expiry, mvr_expiry')
          .eq('org_id', orgId)
          .eq('status', 'active'),

        // Trucks with overdue service schedules
        supabase
          .from('service_schedules')
          .select('truck_id, service_name, interval_miles, interval_days, last_performed_miles, last_performed_date, trucks!inner(org_id, status)')
          .eq('trucks.org_id', orgId)
          .eq('trucks.status', 'active'),

        // Delivered loads with no POD document
        supabase
          .from('fleet_loads')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'delivered')
          .eq('pod_required', true),
      ]);

      // Count expiring drivers client-side (OR across 3 columns)
      let expiringCount = 0;
      if (expiringDrivers.data) {
        expiringCount = expiringDrivers.data.filter((d) => {
          const dates = [d.license_expiry, d.medical_card_expiry, d.mvr_expiry].filter(Boolean) as string[];
          return dates.some((date) => date <= thirtyDaysOut);
        }).length;
      }

      // For delivered loads missing PODs, check which have no POD document
      let missingPodCount = 0;
      if ((missingPods.count ?? 0) > 0) {
        // Get delivered load IDs and check which have POD documents
        const { data: deliveredLoads } = await supabase
          .from('fleet_loads')
          .select('id')
          .eq('org_id', orgId)
          .eq('status', 'delivered')
          .limit(500);

        if (deliveredLoads?.length) {
          const loadIds = deliveredLoads.map((l) => l.id);
          const { data: podDocs } = await supabase
            .from('documents')
            .select('related_id')
            .eq('document_type', 'pod')
            .in('related_id', loadIds);

          const podLoadIds = new Set(podDocs?.map((d) => d.related_id) ?? []);
          missingPodCount = loadIds.filter((id) => !podLoadIds.has(id)).length;
        }
      }

      // Count overdue trucks from service schedules
      let overdueSet = new Set<string>();
      if (overdueTrucks.data) {
        const todayDate = new Date();
        for (const sched of overdueTrucks.data) {
          if (sched.interval_days && sched.last_performed_date) {
            const lastDate = new Date(sched.last_performed_date + 'T00:00:00');
            const dueDate = new Date(lastDate);
            dueDate.setDate(dueDate.getDate() + sched.interval_days);
            if (todayDate > dueDate) overdueSet.add(sched.truck_id);
          }
          // Miles-based overdue detection is harder without current odometer in this query,
          // so we rely on date-based schedules (120-day inspections) here
        }
      }

      const results: BriefingMetric[] = [];

      if ((loadsToday.count ?? 0) > 0) {
        results.push({
          key: 'loads-today',
          label: 'Loads Picking Up Today',
          count: loadsToday.count ?? 0,
          icon: Truck,
          colorClass: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20',
          route: '/loads?status=assigned',
        });
      }

      if (expiringCount > 0) {
        results.push({
          key: 'expiring-drivers',
          label: 'Drivers Expiring < 30 Days',
          count: expiringCount,
          icon: Users,
          colorClass: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20',
          route: '/safety',
        });
      }

      if (overdueSet.size > 0) {
        results.push({
          key: 'overdue-trucks',
          label: 'Trucks Past PM Schedule',
          count: overdueSet.size,
          icon: Wrench,
          colorClass: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
          route: '/maintenance',
        });
      }

      if (missingPodCount > 0) {
        results.push({
          key: 'missing-pods',
          label: 'Delivered Loads Missing PODs',
          count: missingPodCount,
          icon: FileWarning,
          colorClass: 'bg-accent/50 text-accent-foreground border-accent hover:bg-accent/70',
          route: '/loads?status=delivered',
        });
      }

      return results;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  if (!metrics?.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <button
            key={m.key}
            onClick={() => navigate(m.route)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              m.colorClass
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="font-bold">{m.count}</span>
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
