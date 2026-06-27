import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

import { ActiveLoadCard } from '@/components/driver/ActiveLoadCard';
import { NextLoadPreview } from '@/components/driver/NextLoadPreview';
import { DriverPayWidget } from '@/components/driver/DriverPayWidget';
import { WeeklyPerformanceWidget } from '@/components/driver/WeeklyPerformanceWidget';
import { MonthlyBonusWidget } from '@/components/driver/MonthlyBonusWidget';
import { DocumentScanButton } from '@/components/driver/DocumentScanButton';
import { LocationSharing } from '@/components/driver/LocationSharing';
import { DriverRequestsCard } from '@/components/driver/DriverRequestsCard';
import { MaintenanceRequestCard } from '@/components/driver/MaintenanceRequestCard';
import { MyEquipmentCard } from '@/components/driver/MyEquipmentCard';
import { OnboardingRevisionBanner } from '@/components/driver/OnboardingRevisionBanner';
import { DriverLeaderboard } from '@/components/shared/DriverLeaderboard';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Eye, Truck, MapPin, Phone, Mail } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useDriverHomeData } from '@/hooks/useDriverHomeData';

function DriverAvatar({ avatarPath, initials }: { avatarPath: string | null; initials: string }) {
  const isStoragePath = avatarPath && !avatarPath.startsWith('http');
  const { url: signedUrl } = useSignedUrl(
    isStoragePath ? 'documents' : null,
    isStoragePath ? avatarPath : null,
  );
  const displayUrl = isStoragePath ? signedUrl : avatarPath;

  return (
    <Avatar className="h-16 w-16">
      {displayUrl && <AvatarImage src={displayUrl} alt="Driver avatar" />}
      <AvatarFallback className="text-lg">{initials}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Wraps a normally-interactive widget so it can be displayed read-only:
 * a transparent overlay absorbs all pointer events.
 */
function ReadOnly({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div
        className="absolute inset-0 z-10 cursor-not-allowed"
        aria-hidden="true"
        title="Read-only spectator view"
      />
    </div>
  );
}

export default function DriverSpectatorView() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const { isOwner } = useAuth();

  if (!isOwner) {
    navigate('/executive-dashboard');
    return null;
  }

  const {
    driver,
    activeLoad,
    nextLoad,
    assignedTruck,
    driverLocation,
    isLoading,
  } = useDriverHomeData({ driverId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">Driver Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The driver you're looking for could not be found.
        </p>
        <Button onClick={() => navigate('/drivers')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Drivers
        </Button>
      </div>
    );
  }

  const initials = `${driver.first_name?.[0] || ''}${driver.last_name?.[0] || ''}`;
  const isFlatPay = driver.pay_type === 'flat';

  return (
    <div className="space-y-3 pb-6 max-w-4xl mx-auto">
      {/* Spectator Mode Banner */}
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <DriverAvatar avatarPath={driver.avatar_url} initials={initials} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="h-4 w-4 text-primary" />
                  <Badge variant="outline" className="border-primary text-primary">
                    Spectator Mode
                  </Badge>
                </div>
                <h1 className="text-xl font-semibold">
                  {driver.first_name} {driver.last_name}
                </h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                  {assignedTruck && (
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      Unit {assignedTruck.unit_number}
                    </span>
                  )}
                  {driver.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {driver.phone}
                    </span>
                  )}
                  {driver.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {driver.email}
                    </span>
                  )}
                  {driverLocation && (
                    <span className="flex items-center gap-1 text-success">
                      <MapPin className="h-3 w-3" />
                      Live location: {format(new Date(driverLocation.updated_at), 'h:mm a')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/drivers')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Drivers
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Read-Only Notice */}
      <div className="text-xs text-muted-foreground text-center bg-muted/50 rounded-md py-2">
        Viewing driver dashboard in read-only mode. Actions are disabled.
      </div>

      {/* Onboarding Revision banner — same as driver home */}
      <OnboardingRevisionBanner
        driverId={driver.id}
        credentialsStatus={(driver as any).credentials_review_status ?? null}
      />

      {/* My Equipment Card */}
      <ErrorBoundary compact>
        <MyEquipmentCard driverId={driver.id} assignedTruck={assignedTruck as any} />
      </ErrorBoundary>

      {/* Active Load Card — same prioritization as mobile driver */}
      <ErrorBoundary compact>
        <ReadOnly>
          {activeLoad ? (
            <ActiveLoadCard
              load={activeLoad}
              payRate={driver.pay_rate}
              payType={driver.pay_type}
              driverId={driver.id}
            />
          ) : nextLoad ? (
            <NextLoadPreview load={nextLoad} payRate={driver.pay_rate} payType={driver.pay_type} />
          ) : (
            <ActiveLoadCard
              load={undefined}
              payRate={driver.pay_rate}
              payType={driver.pay_type}
              driverId={driver.id}
            />
          )}
        </ReadOnly>
      </ErrorBoundary>

      {/* Up Next (Pre-Plan) */}
      {activeLoad && nextLoad && (
        <ErrorBoundary compact>
          <NextLoadPreview load={nextLoad} payRate={driver.pay_rate} payType={driver.pay_type} />
        </ErrorBoundary>
      )}

      {/* Scan Doc Button (read-only) */}
      <ReadOnly>
        <DocumentScanButton driverId={driver.id} />
      </ReadOnly>

      {/* GPS + Pay row — matches driver layout exactly */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        <ErrorBoundary compact>
          <ReadOnly>
            <LocationSharing
              driverId={driver.id}
              truckId={assignedTruck?.id}
              loadId={activeLoad?.id}
            />
          </ReadOnly>
        </ErrorBoundary>
        <ErrorBoundary compact>
          {isFlatPay ? (
            <WeeklyPerformanceWidget
              driverId={driver.id}
              payRate={driver.pay_rate}
              payType={driver.pay_type}
            />
          ) : (
            <DriverPayWidget
              driverId={driver.id}
              payRate={driver.pay_rate}
              payType={driver.pay_type}
            />
          )}
        </ErrorBoundary>
      </div>

      {/* Monthly Bonus Goal */}
      <ErrorBoundary compact>
        <MonthlyBonusWidget driverId={driver.id} />
      </ErrorBoundary>

      {/* Driver Leaderboard */}
      <ErrorBoundary compact>
        <DriverLeaderboard readOnly />
      </ErrorBoundary>

      {/* Unified Driver Requests & Maintenance (read-only via overlay) */}
      <div className="space-y-3">
        <ErrorBoundary compact>
          <ReadOnly>
            <DriverRequestsCard
              driverId={driver.id}
              truckId={assignedTruck?.id ?? undefined}
              activeLoadId={activeLoad?.id}
              activeLoadNumber={activeLoad?.landstar_load_id}
            />
          </ReadOnly>
        </ErrorBoundary>

        <ErrorBoundary compact>
          <ReadOnly>
            <MaintenanceRequestCard driverId={driver.id} truckId={assignedTruck?.id ?? undefined} />
          </ReadOnly>
        </ErrorBoundary>
      </div>
    </div>
  );
}
