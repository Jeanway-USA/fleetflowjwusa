import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ActiveLoadCard } from '@/components/driver/ActiveLoadCard';
import { useDriverHomeData } from '@/hooks/useDriverHomeData';

import { useAutoArrival } from '@/hooks/useAutoArrival';
import { NextLoadPreview } from '@/components/driver/NextLoadPreview';
import { DriverPayWidget } from '@/components/driver/DriverPayWidget';
import { WeeklyPerformanceWidget } from '@/components/driver/WeeklyPerformanceWidget';
import { MonthlyBonusWidget } from '@/components/driver/MonthlyBonusWidget';
import { DriverPayStubsCard } from '@/components/driver/DriverPayStubsCard';
import { DocumentScanButton } from '@/components/driver/DocumentScanButton';
import { ReportIssueTile } from '@/components/driver/ReportIssueTile';
import { LocationSharing } from '@/components/driver/LocationSharing';
import { DriverNotifications } from '@/components/driver/DriverNotifications';

import { DriverRequestsCard } from '@/components/driver/DriverRequestsCard';
import { MaintenanceRequestCard } from '@/components/driver/MaintenanceRequestCard';
import { MyEquipmentCard } from '@/components/driver/MyEquipmentCard';
import { DriverLeaderboard } from '@/components/shared/DriverLeaderboard';
import { OnboardingRevisionBanner } from '@/components/driver/OnboardingRevisionBanner';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { MyJobCard } from '@/components/driver/MyJobCard';
import { Loader2, RefreshCw } from 'lucide-react';
import { DBtn, Panel } from '@/components/driver/ui/driver-ui';

const DriverDashboard = React.forwardRef<HTMLDivElement>(function DriverDashboard(_, _ref) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['driver-home/driver'] });
    await queryClient.invalidateQueries({ queryKey: ['driver-home/loads'] });
    await queryClient.invalidateQueries({ queryKey: ['driver-home/truck'] });
    await queryClient.invalidateQueries({ queryKey: ['driver-equipment-work-orders'] });
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient]);

  // Shared driver-home payload (same source spectator view uses, so the two can never drift)
  const { driver, activeLoad, nextLoad, assignedTruck, isLoading, refetchLoads } = useDriverHomeData({ userId: user?.id });

  // Driver-only: live GPS coords for geofence auto-arrival (requires is_sharing=true)
  const { data: driverLocation } = useQuery({
    queryKey: ['driver-location-sharing', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('latitude, longitude, is_sharing')
        .eq('driver_id', driver!.id)
        .eq('is_sharing', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000,
  });

  const driverCoords = driverLocation ? { lat: driverLocation.latitude, lng: driverLocation.longitude } : null;

  // Silent background geofence: auto-arrival at origin or destination,
  // flips fleet_loads.status without a driver prompt and writes a log row.
  useAutoArrival(activeLoad ?? null, driverCoords, refetchLoads);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="mx-auto max-w-2xl px-1">
        <Panel className="px-4 py-8 text-center">
          <h2 className="text-lg font-semibold">Driver profile not found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Your account is not linked to a driver profile. Contact your dispatcher or administrator to link it.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
          <h1 className="truncate text-2xl font-semibold leading-tight">{greeting}, {driver.first_name}</h1>
        </div>
        <div className="flex shrink-0 items-center">
          <DBtn tone="ghost" size="md" className="!w-11 !px-0" onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh">
            <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
          </DBtn>
          <ErrorBoundary compact>
            <div id="tour-notifications">
              <DriverNotifications driverId={driver.id} />
            </div>
          </ErrorBoundary>
        </div>
      </div>

      <OnboardingRevisionBanner driverId={driver.id} credentialsStatus={(driver as any).credentials_review_status ?? null} />

      {/* The current load comes first. With none, the load after it takes its place. */}
      <div id="tour-active-load" className="space-y-3">
        <ErrorBoundary compact>
          {activeLoad ? (
            <ActiveLoadCard load={activeLoad} payRate={driver.pay_rate} payType={driver.pay_type} driverId={driver.id} truckId={assignedTruck?.id} onStatusUpdate={refetchLoads} />
          ) : nextLoad ? (
            <NextLoadPreview load={nextLoad} payRate={driver.pay_rate} payType={driver.pay_type} />
          ) : (
            <ActiveLoadCard load={undefined} payRate={driver.pay_rate} payType={driver.pay_type} driverId={driver.id} onStatusUpdate={refetchLoads} />
          )}
        </ErrorBoundary>
        {activeLoad && nextLoad && <NextLoadPreview load={nextLoad} payRate={driver.pay_rate} payType={driver.pay_type} />}
      </div>

      {/* With a load running, scan and issue sit under the load card. Without one they stand alone. */}
      {!activeLoad && (
        <div id="tour-document-scan" className="grid grid-cols-2 gap-2">
          <DocumentScanButton driverId={driver.id} variant="tile" />
          <ReportIssueTile driverId={driver.id} truckId={assignedTruck?.id} />
        </div>
      )}

      <div id="tour-pay-widget">
        <ErrorBoundary compact>
          {driver.pay_type === 'flat' ? (
            <WeeklyPerformanceWidget driverId={driver.id} payRate={driver.pay_rate} payType={driver.pay_type} />
          ) : (
            <DriverPayWidget driverId={driver.id} payRate={driver.pay_rate} payType={driver.pay_type} />
          )}
        </ErrorBoundary>
      </div>

      <ErrorBoundary compact>
        <MyEquipmentCard driverId={driver.id} assignedTruck={assignedTruck as any} />
      </ErrorBoundary>

      <ErrorBoundary compact>
        <LocationSharing driverId={driver.id} truckId={assignedTruck?.id} loadId={activeLoad?.id} />
      </ErrorBoundary>

      <div id="tour-safety-bonus">
        <ErrorBoundary compact>
          <MonthlyBonusWidget driverId={driver.id} />
        </ErrorBoundary>
      </div>

      <div id="tour-driver-requests" className="space-y-3">
        <ErrorBoundary compact>
          <DriverRequestsCard
            driverId={driver.id}
            truckId={assignedTruck?.id}
            activeLoadId={activeLoad?.id}
            activeLoadNumber={activeLoad?.landstar_load_id}
          />
        </ErrorBoundary>

        <ErrorBoundary compact>
          <MaintenanceRequestCard driverId={driver.id} truckId={assignedTruck?.id} />
        </ErrorBoundary>
      </div>

      <ErrorBoundary compact>
        <MyJobCard driverId={driver.id} />
      </ErrorBoundary>

      {/* W-2 pay stubs (only renders for W-2 drivers with history) */}
      <ErrorBoundary compact>
        <DriverPayStubsCard />
      </ErrorBoundary>

      <ErrorBoundary compact>
        <DriverLeaderboard readOnly variant="app" />
      </ErrorBoundary>
    </div>
  );
});

export default DriverDashboard;
