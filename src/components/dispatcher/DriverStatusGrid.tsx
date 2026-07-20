import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Phone, AlertTriangle, Package, CheckCircle, Clock, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { addDays, isBefore, formatDistanceToNow, format, parseISO, startOfDay } from 'date-fns';
import { getEldSyncState } from './eldSync';

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: string;
  license_expiry: string | null;
  medical_card_expiry: string | null;
  hazmat_expiry: string | null;
  remaining_drive_hours: number | null;
  hos_last_updated: string | null;
}

interface HometimeWindow {
  driver_id: string;
  start_date: string;
  end_date: string;
}

interface DriverWithLoad extends Driver {
  activeLoad: boolean;
  activeHometime: HometimeWindow | null;
  upcomingHometime: HometimeWindow | null;
}


type HosTone = 'red' | 'yellow' | 'green' | 'muted';

const HOS_TONE_CLASSES: Record<HosTone, string> = {
  red: 'bg-destructive/10 text-destructive border-destructive/20',
  yellow: 'bg-warning/10 text-warning border-warning/20',
  green: 'bg-success/10 text-success border-success/20',
  muted: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

function getHosState(hours: number | null, updatedAt: string | null) {
  if (updatedAt == null) {
    return { tone: 'muted' as HosTone, label: 'No HOS', isStale: false, relative: null as string | null };
  }
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const isStale = ageMs > 14 * 3600 * 1000;
  const relative = `Updated ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true }).replace('about ', '')}`;

  if (isStale) {
    return { tone: 'muted' as HosTone, label: 'Pending Reset', isStale: true, relative };
  }
  if (hours == null) {
    return { tone: 'muted' as HosTone, label: 'No HOS', isStale: false, relative };
  }
  let tone: HosTone = 'green';
  if (hours <= 2) tone = 'red';
  else if (hours <= 6) tone = 'yellow';
  return { tone, label: `${hours}h drive`, isStale: false, relative };
}

export function DriverStatusGrid() {
  const navigate = useNavigate();

  const { data: drivers, isLoading } = useQuery({
    queryKey: ['drivers-status-dispatcher'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data: driversData, error: driversError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, phone, status, license_expiry, medical_card_expiry, hazmat_expiry, remaining_drive_hours, hos_last_updated')
        .eq('status', 'active')
        .order('first_name');
      
      if (driversError) throw driversError;

      // Get active loads to check assignments
      const { data: activeLoads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('driver_id')
        .in('status', ['assigned', 'loading', 'in_transit', 'unloading']);
      
      if (loadsError) throw loadsError;

      // Approved hometime windows: active or upcoming within 14 days
      const todayIso = format(new Date(), 'yyyy-MM-dd');
      const horizonIso = format(addDays(new Date(), 14), 'yyyy-MM-dd');
      const { data: hometimeRows } = await supabase
        .from('driver_requests')
        .select('driver_id, start_date, end_date')
        .eq('request_type', 'home_time')
        .eq('status', 'approved')
        .not('start_date', 'is', null)
        .not('end_date', 'is', null)
        .gte('end_date', todayIso)
        .lte('start_date', horizonIso);

      const today = startOfDay(new Date());
      const hometimeByDriver = new Map<string, HometimeWindow[]>();
      for (const h of hometimeRows || []) {
        if (!h.driver_id || !h.start_date || !h.end_date) continue;
        const list = hometimeByDriver.get(h.driver_id) || [];
        list.push(h as HometimeWindow);
        hometimeByDriver.set(h.driver_id, list);
      }

      const assignedDriverIds = new Set(activeLoads?.map(l => l.driver_id).filter(Boolean));

      return driversData?.map(driver => {
        const windows = hometimeByDriver.get(driver.id) || [];
        const active =
          windows.find(w => {
            const s = startOfDay(parseISO(`${w.start_date}T00:00:00`));
            const e = startOfDay(parseISO(`${w.end_date}T00:00:00`));
            return today >= s && today <= e;
          }) || null;
        const upcoming = active
          ? null
          : windows
              .filter(w => startOfDay(parseISO(`${w.start_date}T00:00:00`)) > today)
              .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;

        return {
          ...driver,
          activeLoad: assignedDriverIds.has(driver.id),
          activeHometime: active,
          upcomingHometime: upcoming,
        };
      }) as DriverWithLoad[];
    },
  });


  const getExpiringCredentials = (driver: Driver) => {
    const warnings: string[] = [];
    const warningThreshold = addDays(new Date(), 30);

    if (driver.license_expiry && isBefore(new Date(driver.license_expiry), warningThreshold)) {
      warnings.push('License');
    }
    if (driver.medical_card_expiry && isBefore(new Date(driver.medical_card_expiry), warningThreshold)) {
      warnings.push('Medical');
    }
    if (driver.hazmat_expiry && isBefore(new Date(driver.hazmat_expiry), warningThreshold)) {
      warnings.push('Hazmat');
    }

    return warnings;
  };

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Driver Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const onHometimeDrivers = drivers?.filter(d => d.activeHometime) || [];
  const onLoadDrivers = drivers?.filter(d => d.activeLoad && !d.activeHometime) || [];
  const availableDrivers = drivers?.filter(d => !d.activeLoad && !d.activeHometime) || [];

  return (
    <Card className="card-elevated h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Driver Status
            </CardTitle>
            <CardDescription>
              {availableDrivers.length} available • {onLoadDrivers.length} on load
              {onHometimeDrivers.length > 0 && <> • {onHometimeDrivers.length} on hometime</>}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/drivers')}>
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {drivers && drivers.length > 0 ? (
          <TooltipProvider delayDuration={150}>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 max-h-[300px] overflow-y-auto pr-1">
            {drivers.map((driver) => {
              const expiringCreds = getExpiringCredentials(driver);
              const hos = getHosState(driver.remaining_drive_hours, driver.hos_last_updated);
              const hosBadge = (
                <Badge variant="outline" className={`${HOS_TONE_CLASSES[hos.tone]} shrink-0 gap-1`}>
                  <Clock className="h-3 w-3" />
                  {hos.label}
                </Badge>
              );
              
              return (
                <div
                  key={driver.id}
                  className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate('/drivers')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {driver.first_name} {driver.last_name}
                      </p>
                      {driver.phone && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Phone className="h-3 w-3" />
                          <span>{driver.phone}</span>
                        </div>
                      )}
                    </div>
                    {driver.activeHometime ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 shrink-0"
                          >
                            <Home className="h-3 w-3 mr-1" /> On Hometime
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Hometime {format(parseISO(`${driver.activeHometime.start_date}T00:00:00`), 'MMM d')}–
                          {format(parseISO(`${driver.activeHometime.end_date}T00:00:00`), 'MMM d')}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge
                        variant="outline"
                        className={driver.activeLoad
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 shrink-0'
                          : 'bg-green-500/10 text-green-500 border-green-500/20 shrink-0'
                        }
                      >
                        {driver.activeLoad ? (
                          <><Package className="h-3 w-3 mr-1" /> On Load</>
                        ) : (
                          <><CheckCircle className="h-3 w-3 mr-1" /> Available</>
                        )}
                      </Badge>
                    )}
                  </div>

                  {driver.upcomingHometime && !driver.activeHometime && (
                    <div className="flex items-center gap-1 mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      <Home className="h-3 w-3" />
                      Hometime {format(parseISO(`${driver.upcomingHometime.start_date}T00:00:00`), 'MMM d')}–
                      {format(parseISO(`${driver.upcomingHometime.end_date}T00:00:00`), 'MMM d')}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    {hos.isStale ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{hosBadge}</span>
                        </TooltipTrigger>
                        <TooltipContent>Pending Reset — Verify with Driver</TooltipContent>
                      </Tooltip>
                    ) : (
                      hosBadge
                    )}
                    {hos.relative && (
                      <span className="text-[11px] text-muted-foreground truncate">{hos.relative}</span>
                    )}
                  </div>

                  {expiringCreds.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Expiring: {expiringCreds.join(', ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </TooltipProvider>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No active drivers found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
