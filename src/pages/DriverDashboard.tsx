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
  const { data: activeLoads = [], isLoading: loadsLoading } = useQuery({
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
      <div className="space-y-4 pb-8 max-w-4xl mx-auto">
        {/* Header - My Day */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {currentHour >= 6 && currentHour < 18 ? (
                <Sun className="h-6 w-6 text-primary" />
              ) : (
                <Moon className="h-6 w-6 text-primary" />
              )}
              {greeting}, {driver.first_name}
            </h1>
            <p className="text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Active Load Card */}
        <ActiveLoadCard 
          load={activeLoad} 
          payRate={driver.pay_rate} 
          payType={driver.pay_type} 
        />

        {/* Next Load Preview */}
        {nextLoad && <NextLoadPreview load={nextLoad} />}

        {/* Pay Widget */}
        <DriverPayWidget 
          driverId={driver.id} 
          payRate={driver.pay_rate} 
          payType={driver.pay_type} 
        />

        {/* No Truck Assigned Warning */}
        {!assignedTruck && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-warning">No Truck Assigned</p>
              <p className="text-sm text-muted-foreground">
                You don't have a truck assigned yet. Contact dispatch to get assigned a truck before you can complete inspections or report maintenance issues.
              </p>
            </div>
          </div>
        )}

        {/* Quick Actions Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <DVIRButtons 
            driverId={driver.id} 
            truckId={assignedTruck?.id} 
            hasPreTrip={hasPreTrip}
            hasPostTrip={hasPostTrip}
          />
          <DocumentScanButton driverId={driver.id} />
        </div>

        {/* Maintenance Request Status */}
        <MaintenanceRequestCard 
          requests={maintenanceRequests}
          driverId={driver.id}
          truckId={assignedTruck?.id}
        />
      </div>
    </DashboardLayout>
  );
}
