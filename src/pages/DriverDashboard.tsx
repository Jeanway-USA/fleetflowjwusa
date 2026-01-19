import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ActiveLoadCard } from '@/components/driver/ActiveLoadCard';
import { NextLoadPreview } from '@/components/driver/NextLoadPreview';
import { DriverPayWidget } from '@/components/driver/DriverPayWidget';
import { DVIRButtons } from '@/components/driver/DVIRButtons';
import { MaintenanceRequestCard } from '@/components/driver/MaintenanceRequestCard';
import { DocumentScanButton } from '@/components/driver/DocumentScanButton';
import { DVIRHistory } from '@/components/driver/DVIRHistory';
import { LocationSharing } from '@/components/driver/LocationSharing';
import { Loader2, Sun, Moon, AlertTriangle } from 'lucide-react';

export default function DriverDashboard() {
  const { user } = useAuth();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';

  // Get driver record for current user
  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: ['driver-for-user', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*, trucks!trucks_current_driver_id_fkey(*)')
        .eq('user_id', user?.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Get active loads for this driver
  const { data: activeLoads = [], isLoading: loadsLoading, refetch: refetchLoads } = useQuery({
    queryKey: ['driver-active-loads', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, trucks(*), load_accessorials(*)')
        .eq('driver_id', driver?.id)
        .in('status', ['assigned', 'loading', 'in_transit', 'pending'])
        .order('pickup_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  // Get driver's truck
  const { data: assignedTruck } = useQuery({
    queryKey: ['driver-truck', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('current_driver_id', driver?.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  // Get today's inspections
  const { data: todayInspections = [] } = useQuery({
    queryKey: ['driver-inspections-today', driver?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('driver_inspections')
        .select('*')
        .eq('driver_id', driver?.id)
        .gte('inspection_date', today + 'T00:00:00')
        .lte('inspection_date', today + 'T23:59:59');
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  // Get open maintenance requests
  const { data: maintenanceRequests = [] } = useQuery({
    queryKey: ['driver-maintenance-requests', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*, trucks(*)')
        .eq('driver_id', driver?.id)
        .neq('status', 'completed')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  const isLoading = driverLoading || loadsLoading;
  const activeLoad = activeLoads.find(l => l.status === 'in_transit' || l.status === 'loading') || activeLoads[0];
  const nextLoad = activeLoads.find(l => l.id !== activeLoad?.id);

  const hasPreTrip = todayInspections.some(i => i.inspection_type === 'pre_trip');
  const hasPostTrip = todayInspections.some(i => i.inspection_type === 'post_trip');

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!driver) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="bg-destructive/10 p-6 rounded-full mb-4">
            <Moon className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Driver Profile Not Found</h2>
          <p className="text-muted-foreground max-w-md">
            Your account is not linked to a driver profile. Please contact your dispatcher or administrator to link your account.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3 pb-6 max-w-4xl mx-auto">
        {/* Compact Header */}
        <div className="flex items-center justify-between py-1">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            {currentHour >= 6 && currentHour < 18 ? (
              <Sun className="h-5 w-5 text-primary" />
            ) : (
              <Moon className="h-5 w-5 text-primary" />
            )}
            {greeting}, {driver.first_name}
          </h1>
          <span className="text-sm text-muted-foreground">
            {format(new Date(), 'EEE, MMM d')}
          </span>
        </div>

        {/* No Truck Warning - Compact */}
        {!assignedTruck && (
          <div className="bg-warning/10 border border-warning/30 rounded-md p-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span className="text-warning font-medium">No truck assigned - contact dispatch</span>
          </div>
        )}

        {/* Active Load Card */}
        <ActiveLoadCard 
          load={activeLoad} 
          payRate={driver.pay_rate} 
          payType={driver.pay_type}
          onStatusUpdate={refetchLoads}
        />

        {/* Next Load Preview */}
        {nextLoad && <NextLoadPreview load={nextLoad} />}

        {/* Quick Actions - Full Width Row */}
        <div className="grid grid-cols-3 gap-2">
          <DVIRButtons 
            driverId={driver.id} 
            truckId={assignedTruck?.id} 
            hasPreTrip={hasPreTrip}
            hasPostTrip={hasPostTrip}
          />
          <DocumentScanButton driverId={driver.id} />
        </div>

        {/* GPS + Pay in one row on larger screens */}
        <div className="grid gap-3 md:grid-cols-2">
          <LocationSharing 
            driverId={driver.id}
            truckId={assignedTruck?.id}
            loadId={activeLoad?.id}
          />
          <DriverPayWidget 
            driverId={driver.id} 
            payRate={driver.pay_rate} 
            payType={driver.pay_type} 
          />
        </div>

        {/* Maintenance Request Status */}
        <MaintenanceRequestCard 
          requests={maintenanceRequests}
          driverId={driver.id}
          truckId={assignedTruck?.id}
        />

        {/* DVIR History */}
        <DVIRHistory driverId={driver.id} />
      </div>
    </DashboardLayout>
  );
}
