import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { ActiveLoadCard } from '@/components/driver/ActiveLoadCard';
import { NextLoadPreview } from '@/components/driver/NextLoadPreview';
import { DriverPayWidget } from '@/components/driver/DriverPayWidget';
import { MonthlyBonusWidget } from '@/components/driver/MonthlyBonusWidget';
import { LocationSharing } from '@/components/driver/LocationSharing';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Eye, Truck, MapPin, Phone, Mail, Clock, Home, CalendarDays, Wrench } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';

type RequestType = 'detention' | 'home_time' | 'pto' | 'maintenance';

const TYPE_META: Record<RequestType, { label: string; icon: React.ReactNode }> = {
  detention: { label: 'Detention', icon: <Clock className="h-3.5 w-3.5" /> },
  home_time: { label: 'Home Time', icon: <Home className="h-3.5 w-3.5" /> },
  pto: { label: 'PTO', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  maintenance: { label: 'Issue', icon: <Wrench className="h-3.5 w-3.5" /> },
};

function DriverAvatar({ avatarPath, initials }: { avatarPath: string | null; initials: string }) {
  const isStoragePath = avatarPath && !avatarPath.startsWith('http');
  const { url: signedUrl } = useSignedUrl(
    isStoragePath ? 'documents' : null, 
    isStoragePath ? avatarPath : null
  );
  const displayUrl = isStoragePath ? signedUrl : avatarPath;

  return (
    <Avatar className="h-16 w-16">
      {displayUrl && <AvatarImage src={displayUrl} alt="Driver avatar" />}
      <AvatarFallback className="text-lg">{initials}</AvatarFallback>
    </Avatar>
  );
}

export default function DriverSpectatorView() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const { isOwner } = useAuth();

  // Redirect if not owner
  if (!isOwner) {
    navigate('/executive-dashboard');
    return null;
  }

  // Get driver record
  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: ['driver-spectator', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*, trucks!trucks_current_driver_id_fkey(*)')
        .eq('id', driverId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  // Get active loads for this driver
  const { data: activeLoads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ['driver-active-loads-spectator', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, trucks(*), load_accessorials(*)')
        .eq('driver_id', driverId)
        .in('status', ['assigned', 'loading', 'in_transit', 'pending'])
        .order('pickup_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  // Get driver's truck
  const { data: assignedTruck } = useQuery({
    queryKey: ['driver-truck-spectator', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('current_driver_id', driverId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!driverId,
  });

  // Get driver requests (unified)
  const { data: driverRequests = [] } = useQuery({
    queryKey: ['driver-requests-spectator', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_requests')
        .select('*')
        .eq('driver_id', driverId!)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  // Get driver's current location
  const { data: driverLocation } = useQuery({
    queryKey: ['driver-location-spectator', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('*')
        .eq('driver_id', driverId!)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
    refetchInterval: 30000,
  });

  const isLoading = driverLoading || loadsLoading;
  const activeLoad = activeLoads.find(l => l.status === 'in_transit' || l.status === 'loading') || activeLoads[0];
  const nextLoad = activeLoads.find(l => l.id !== activeLoad?.id);

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
          <h2 className="text-xl font-semibold mb-2">Driver Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The driver you're looking for could not be found.
          </p>
          <Button onClick={() => navigate('/drivers')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Drivers
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const initials = `${driver.first_name?.[0] || ''}${driver.last_name?.[0] || ''}`;

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-6 max-w-4xl mx-auto">
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

        {/* Active Load Card (read-only) */}
        <ActiveLoadCard 
          load={activeLoad} 
          payRate={driver.pay_rate} 
          payType={driver.pay_type}
        />

        {/* Next Load Preview */}
        {nextLoad && <NextLoadPreview load={nextLoad} />}

        {/* GPS Location Status */}
        {driverLocation && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-sm font-medium">GPS Active</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  Last update: {format(new Date(driverLocation.updated_at), 'MMM d, h:mm a')}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pay Widget (read-only) */}
        <DriverPayWidget 
          driverId={driver.id} 
          payRate={driver.pay_rate} 
          payType={driver.pay_type} 
        />

        {/* Monthly Bonus Goal */}
        <MonthlyBonusWidget driverId={driver.id} />

        {/* Driver Requests (read-only) */}
        {driverRequests.length > 0 && (
          <Card>
            <CardContent className="py-4">
              <h3 className="font-medium mb-2">Driver Requests</h3>
              <div className="space-y-2">
                {driverRequests.map((req: any) => {
                  const meta = TYPE_META[req.request_type as RequestType] || TYPE_META.detention;
                  return (
                    <div key={req.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50">
                      <span className="text-muted-foreground">{meta.icon}</span>
                      <span className="flex-1 truncate">{req.subject}</span>
                      <Badge 
                        variant={req.status === 'approved' ? 'default' : req.status === 'denied' ? 'destructive' : 'outline'}
                        className="text-xs capitalize"
                      >
                        {req.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
