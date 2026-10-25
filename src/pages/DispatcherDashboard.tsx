import { useEffect, lazy, Suspense, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { OPEN_STATUSES, ON_ROAD_STATUSES, dispatchCounts, isPastDue } from '@/lib/dispatch';
import { ActiveLoadsBoard } from '@/components/dispatcher/ActiveLoadsBoard';

import { DriverStatusGrid } from '@/components/dispatcher/DriverStatusGrid';
import { TruckStatusGrid } from '@/components/dispatcher/TruckStatusGrid';
import { DispatcherAlerts } from '@/components/dispatcher/DispatcherAlerts';
const FleetMapView = lazy(() =>
  import('@/components/dispatcher/FleetMapView').then(m => ({ default: m.FleetMapView })),
);
import { MapSkeleton } from '@/components/shared/LazyFallbacks';
import { DeferredMap } from '@/components/shared/DeferredMap';
import { FleetTimelineScheduler } from '@/components/dispatcher/FleetTimelineScheduler';
import { UnassignedLoadsDrawer } from '@/components/dispatcher/UnassignedLoadsDrawer';
import { UpcomingPickups } from '@/components/dispatcher/UpcomingPickups';
import { DriverLeaderboard } from '@/components/shared/DriverLeaderboard';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';


export default function DispatcherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Scroll to a section when navigated with a hash (e.g. from command palette ⌘K → Assign Driver)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => clearTimeout(t);
  }, []);


  // Fetch user's first name from profile
  const { data: profile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .single();

      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // The numbers across the top: counted from loads that are open and not archived.
  const { data: stats } = useQuery({
    queryKey: ['dispatcher-stats'],
    queryFn: async () => {
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const soon = format(addDays(now, 2), 'yyyy-MM-dd');

      const { data: open, error } = await supabase
        .from('fleet_loads')
        .select('status, driver_id, pickup_date, delivery_date')
        .is('deleted_at', null)
        .in('status', [...OPEN_STATUSES]);
      if (error) throw error;
      const loads = open ?? [];

      const { data: drivers } = await supabase.from('drivers_public_view').select('id').eq('status', 'active');
      // A driver is busy while holding an open load that is not past due.
      const busy = new Set(loads.filter((l) => !isPastDue(l, today) && (l.status === 'assigned' || (ON_ROAD_STATUSES as readonly string[]).includes(l.status))).map((l) => l.driver_id).filter(Boolean));
      const availableDrivers = (drivers ?? []).filter((d) => !busy.has(d.id)).length;

      const { count: activeTrucks } = await supabase.from('trucks').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active');

      return { ...dispatchCounts(loads, today, soon), availableDrivers, activeTrucks: activeTrucks || 0 };
    },
    staleTime: 2 * 60 * 1000,
  });

  // Real-time updates for dispatcher stats when loads change
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('dispatcher-stats-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'fleet_loads',
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['dispatcher-stats'] });
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription unavailable:', err);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);


  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = profile?.first_name || user?.email?.split('@')[0] || 'Dispatcher';

  const [tab, setTab] = useState('command-center');

  const cells: Array<{ key: string; label: string; value: number; note: string; tone?: 'bad' | 'warn'; tab: string }> = [
    { key: 'road', label: 'On the road', value: stats?.onRoad ?? 0, note: 'Working a load now', tab: 'command-center' },
    { key: 'driver', label: 'Need a driver', value: stats?.needDriver ?? 0, note: 'Booked, nobody assigned', tone: (stats?.needDriver ?? 0) > 0 ? 'warn' : undefined, tab: 'dispatch-board' },
    { key: 'soon', label: 'Pickups in 48 hours', value: stats?.pickupsSoon ?? 0, note: 'Not yet started', tab: 'dispatch-board' },
    { key: 'late', label: 'Past due', value: stats?.pastDue ?? 0, note: 'Delivery date has passed', tone: (stats?.pastDue ?? 0) > 0 ? 'bad' : undefined, tab: 'dispatch-board' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Dispatch" description={`${getGreeting()}, ${displayName}. ${format(new Date(), 'EEEE, MMMM d')}.`} action={{ label: 'New load', onClick: () => navigate('/fleet-loads') }} />

      <div>
        <dl className="grid grid-cols-2 divide-x divide-y rounded-lg border bg-card lg:grid-cols-4 lg:divide-y-0">
          {cells.map((c) => (
            <div key={c.key} className="min-w-0">
              <button
                type="button"
                onClick={() => setTab(c.tab)}
                className="block min-h-[84px] w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <dt className="text-[13px] text-muted-foreground">{c.label}</dt>
                <dd className={`figure text-3xl font-bold leading-tight ${c.tone === 'bad' ? 'text-destructive' : c.tone === 'warn' ? 'text-warning' : ''}`}>{stats ? c.value : '…'}</dd>
                <dd className="truncate text-xs text-muted-foreground">{c.note}</dd>
              </button>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {stats ? `${stats.availableDrivers} ${stats.availableDrivers === 1 ? 'driver' : 'drivers'} free, ${stats.activeTrucks} ${stats.activeTrucks === 1 ? 'truck' : 'trucks'} in service` : ' '}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto">
          {[
            ['command-center', 'Overview'],
            ['dispatch-board', 'Schedule and loads'],
            ['fleet-roster', 'Drivers and trucks'],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-11 shrink-0 px-4"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="command-center" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
            <div className="flex h-full flex-col lg:col-span-2" data-tour="fleet-map">
              <ErrorBoundary compact>
                <DeferredMap height={360}>
                  <Suspense fallback={<MapSkeleton height={360} />}>
                    <FleetMapView />
                  </Suspense>
                </DeferredMap>
              </ErrorBoundary>
            </div>
            <div className="flex h-full flex-col">
              <ErrorBoundary compact>
                <DispatcherAlerts />
              </ErrorBoundary>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dispatch-board" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-4">
            <div className="space-y-5 lg:col-span-3">
              <ErrorBoundary compact>
                <FleetTimelineScheduler hideUnassignedTray />
              </ErrorBoundary>
              <div data-tour="active-loads">
                <ErrorBoundary compact>
                  <ActiveLoadsBoard />
                </ErrorBoundary>
              </div>
            </div>
            <div className="space-y-4 lg:col-span-1">
              <ErrorBoundary compact>
                <UnassignedLoadsDrawer />
              </ErrorBoundary>
              <ErrorBoundary compact>
                <UpcomingPickups />
              </ErrorBoundary>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="fleet-roster" className="mt-5 space-y-5">
          <div data-tour="driver-status" className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2">
            <DriverStatusGrid />
            <TruckStatusGrid />
          </div>
          <ErrorBoundary compact>
            <DriverLeaderboard />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
