
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ActiveLoadCard } from '@/components/driver/ActiveLoadCard';
import { TripFuelPlanner } from '@/components/driver/TripFuelPlanner';
import { NextLoadPreview } from '@/components/driver/NextLoadPreview';
import { DriverPayWidget } from '@/components/driver/DriverPayWidget';
import { MonthlyBonusWidget } from '@/components/driver/MonthlyBonusWidget';
import { DocumentScanButton } from '@/components/driver/DocumentScanButton';
import { LocationSharing } from '@/components/driver/LocationSharing';
import { DriverNotifications } from '@/components/driver/DriverNotifications';
import { DriverRequestsCard } from '@/components/driver/DriverRequestsCard';
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
        .maybeSingle();
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

  const isLoading = driverLoading || loadsLoading;
  const activeLoad = activeLoads.find(l => l.status === 'in_transit' || l.status === 'loading') || activeLoads[0];
  const nextLoad = activeLoads.find(l => l.id !== activeLoad?.id);

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!driver) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="bg-destructive/10 p-6 rounded-full mb-4">
            <Moon className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Driver Profile Not Found</h2>
          <p className="text-muted-foreground max-w-md">
            Your account is not linked to a driver profile. Please contact your dispatcher or administrator to link your account.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
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
          <div className="flex items-center gap-2">
            <DriverNotifications driverId={driver.id} />
            <span className="text-sm text-muted-foreground">
              {format(new Date(), 'EEE, MMM d')}
            </span>
          </div>
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
          driverId={driver.id}
          onStatusUpdate={refetchLoads}
        />

        {/* Fuel Trip Planner - shows when there's an active/upcoming load */}
        {activeLoad && (
          <TripFuelPlanner
            driverId={driver.id}
            origin={activeLoad.origin}
            destination={activeLoad.destination}
            bookedMiles={activeLoad.booked_miles}
            notes={activeLoad.notes}
          />
        )}

        {/* Next Load Preview */}
        {nextLoad && <NextLoadPreview load={nextLoad} />}

        {/* Scan Doc Button */}
        <DocumentScanButton driverId={driver.id} />

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

        {/* Monthly Bonus Goal */}
        <MonthlyBonusWidget driverId={driver.id} />

        {/* Unified Driver Requests */}
        <DriverRequestsCard 
          driverId={driver.id}
          truckId={assignedTruck?.id}
          activeLoadId={activeLoad?.id}
          activeLoadNumber={activeLoad?.landstar_load_id}
        />
      </div>
    </>
  );
}
