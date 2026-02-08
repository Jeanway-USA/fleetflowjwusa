import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Users, Truck, Calendar, Plus, ArrowRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Navigate } from 'react-router-dom';
import { addHours } from 'date-fns';
import { ActiveLoadsBoard } from '@/components/dispatcher/ActiveLoadsBoard';
import { UpcomingPickups } from '@/components/dispatcher/UpcomingPickups';
import { DriverStatusGrid } from '@/components/dispatcher/DriverStatusGrid';
import { TruckStatusGrid } from '@/components/dispatcher/TruckStatusGrid';
import { DispatcherAlerts } from '@/components/dispatcher/DispatcherAlerts';
import { FleetMapView } from '@/components/dispatcher/FleetMapView';
import { DriverAssignmentPanel } from '@/components/dispatcher/DriverAssignmentPanel';

export default function DispatcherDashboard() {
  const { user, roles, hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

      // Active loads
      const { count: activeLoads } = await supabase
        .from('fleet_loads')
        .select('*', { count: 'exact', head: true })
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading']);

      // Available drivers (active drivers not on a load)
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id')
        .eq('status', 'active');

      const { data: assignedLoads } = await supabase
        .from('fleet_loads')
        .select('driver_id')
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading']);

      const assignedDriverIds = new Set(assignedLoads?.map(l => l.driver_id).filter(Boolean));
      const availableDrivers = drivers?.filter(d => !assignedDriverIds.has(d.id)).length || 0;

      // Available trucks
      const { count: activeTrucks } = await supabase
        .from('trucks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Upcoming pickups in next 48 hours
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
  });

  // Real-time updates for dispatcher stats when loads change
  useEffect(() => {
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Redirect if user doesn't have dispatcher or owner role (after all hooks)
  if (!hasRole('dispatcher') && !hasRole('owner') && roles.length > 0) {
    return <Navigate to="/" replace />;
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Get display name - prefer first name from profile, fallback to email
  const displayName = profile?.first_name || user?.email?.split('@')[0] || 'Dispatcher';

  const statCards = [
    { label: 'Active Loads', value: stats?.activeLoads || 0, icon: Package, color: 'text-blue-500' },
    { label: 'Available Drivers', value: stats?.availableDrivers || 0, icon: Users, color: 'text-green-500' },
    { label: 'Active Trucks', value: stats?.activeTrucks || 0, icon: Truck, color: 'text-amber-500' },
    { label: 'Upcoming Pickups', value: stats?.upcomingPickups || 0, icon: Calendar, color: 'text-purple-500' },
  ];

  return (
    <DashboardLayout>
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

        {/* Stats Grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.label} className="card-elevated">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Map + Assignment Panel Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Map - Square, takes 1 column */}
          <div>
            <FleetMapView />
          </div>

          {/* Driver Assignment Panel */}
          <div>
            <DriverAssignmentPanel />
          </div>

          {/* Alerts */}
          <div>
            <DispatcherAlerts />
          </div>
        </div>

        {/* Active Loads - Full Width */}
        <ActiveLoadsBoard />

        {/* Upcoming Pickups - Full Width */}
        <UpcomingPickups />

        {/* Fleet Status Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          <DriverStatusGrid />
          <TruckStatusGrid />
        </div>

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
    </DashboardLayout>
  );
}
