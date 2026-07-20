import { useEffect, lazy, Suspense, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Users, Truck, Clock, Plus, ArrowRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { addHours } from 'date-fns';
import { ActiveLoadsBoard } from '@/components/dispatcher/ActiveLoadsBoard';
import { UpcomingPickups } from '@/components/dispatcher/UpcomingPickups';
import { DriverStatusGrid } from '@/components/dispatcher/DriverStatusGrid';
import { TruckStatusGrid } from '@/components/dispatcher/TruckStatusGrid';
import { DispatcherAlerts } from '@/components/dispatcher/DispatcherAlerts';
const FleetMapView = lazy(() =>
  import('@/components/dispatcher/FleetMapView').then(m => ({ default: m.FleetMapView })),
);
import { MapSkeleton } from '@/components/shared/LazyFallbacks';
import { FleetTimelineScheduler } from '@/components/dispatcher/FleetTimelineScheduler';
import { UnassignedLoadsDrawer } from '@/components/dispatcher/UnassignedLoadsDrawer';
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

  // Fetch stats data
  const { data: stats } = useQuery({
    queryKey: ['dispatcher-stats'],
    queryFn: async () => {
      const now = new Date();
      const in48Hours = addHours(now, 48);

      const { count: activeLoads } = await supabase
        .from('fleet_loads')
        .select('*', { count: 'exact', head: true })
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading']);

      const { data: drivers } = await supabase
        .from('drivers_public_view')
        .select('id')
        .eq('status', 'active');

      const { data: assignedLoads } = await supabase
        .from('fleet_loads')
        .select('driver_id')
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading']);

      const assignedDriverIds = new Set(assignedLoads?.map(l => l.driver_id).filter(Boolean));
      const availableDrivers = drivers?.filter(d => !assignedDriverIds.has(d.id)).length || 0;

      const { count: activeTrucks } = await supabase
        .from('trucks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: upcomingPickups } = await supabase
        .from('fleet_loads')
        .select('*', { count: 'exact', head: true })
        .in('status', ['booked', 'assigned'])
        .gte('pickup_date', now.toISOString())
        .lte('pickup_date', in48Hours.toISOString());

      return {
        activeLoads: activeLoads || 0,
        availableDrivers,
        activeTrucks: activeTrucks || 0,
        upcomingPickups: upcomingPickups || 0,
      };
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

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    } catch {
      return 'Local';
    }
  }, []);

  const statCards = [
    { label: 'Active Loads', value: stats?.activeLoads ?? 0, icon: Package, color: 'text-blue-500' },
    { label: 'Available Drivers', value: stats?.availableDrivers ?? 0, icon: Users, color: 'text-green-500' },
    { label: 'Active Trucks', value: stats?.activeTrucks ?? 0, icon: Truck, color: 'text-amber-500' },
    { label: 'Timezone', value: timezone, icon: Clock, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {getGreeting()}, <span className="text-gradient-gold">{displayName}</span>
          </h1>
          <p className="text-muted-foreground mt-1">Dispatcher Operations Center</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/fleet-loads')} className="gap-2">
            <Plus className="h-4 w-4" />
            New Load
          </Button>
        </div>
      </div>

      {/* Pinned KPI Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="card-elevated">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1 truncate">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-80 shrink-0`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="command-center" className="w-full">
        <TabsList className="w-full justify-start bg-transparent p-0 h-auto border-b border-border rounded-none gap-1">
          <TabsTrigger
            value="command-center"
            className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-colors"
          >
            Command Center
          </TabsTrigger>
          <TabsTrigger
            value="dispatch-board"
            className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-colors"
          >
            Dispatch Board
          </TabsTrigger>
          <TabsTrigger
            value="fleet-roster"
            className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-colors"
          >
            Fleet Roster
          </TabsTrigger>
        </TabsList>

        {/* Command Center */}
        <TabsContent value="command-center" className="mt-6 space-y-6">
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-stretch">
            {/* Map - 2/3 width on large screens */}
            <div className="lg:col-span-2 h-full flex flex-col" data-tour="fleet-map">
              <ErrorBoundary compact>
                <Suspense fallback={<MapSkeleton height={360} />}>
                  <FleetMapView />
                </Suspense>
              </ErrorBoundary>
            </div>

            {/* Right column: Alerts stretched to Map height */}
            <div className="h-full flex flex-col">
              <ErrorBoundary compact>
                <DispatcherAlerts />
              </ErrorBoundary>
            </div>
          </div>

          {/* Quick Actions - full width beneath map/alerts */}
          <Card className="card-elevated">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">Quick Actions:</span>
                <Button variant="outline" size="sm" onClick={() => navigate('/fleet-loads')} className="gap-2">
                  <Package className="h-4 w-4" />
                  All Loads
                  <ArrowRight className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/drivers')} className="gap-2">
                  <Users className="h-4 w-4" />
                  All Drivers
                  <ArrowRight className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/trucks')} className="gap-2">
                  <Truck className="h-4 w-4" />
                  All Trucks
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dispatch Board */}
        <TabsContent value="dispatch-board" className="mt-6 space-y-6">
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-4">
            <div className="lg:col-span-3">
              <ErrorBoundary compact>
                <FleetTimelineScheduler hideUnassignedTray />
              </ErrorBoundary>
            </div>
            <div className="lg:col-span-1">
              <ErrorBoundary compact>
                <UnassignedLoadsDrawer />
              </ErrorBoundary>
            </div>
          </div>

          <div data-tour="active-loads">
            <ErrorBoundary compact>
              <ActiveLoadsBoard />
            </ErrorBoundary>
          </div>
        </TabsContent>

        {/* Fleet Roster */}
        <TabsContent value="fleet-roster" className="mt-6 space-y-6">
          <div data-tour="driver-status" className="grid gap-6 grid-cols-1 md:grid-cols-2 items-stretch">
            <DriverStatusGrid />
            <TruckStatusGrid />
          </div>

          <ErrorBoundary compact>
            <DriverLeaderboard />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>

      {/* Quick Actions Footer */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Quick Actions:</span>
            <Button variant="outline" size="sm" onClick={() => navigate('/fleet-loads')} className="gap-2">
              <Package className="h-4 w-4" />
              All Loads
              <ArrowRight className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/drivers')} className="gap-2">
              <Users className="h-4 w-4" />
              All Drivers
              <ArrowRight className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/trucks')} className="gap-2">
              <Truck className="h-4 w-4" />
              All Trucks
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
