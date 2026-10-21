import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { addDays, isBefore, formatDistanceToNow, format, parseISO, startOfDay } from 'date-fns';
import { Panel } from '@/components/finance/statement-ui';
import { Roster, type RosterEntry, type RosterFact } from '@/components/fleet/Roster';
import { ON_ROAD_STATUSES, OPEN_STATUSES, isPastDue } from '@/lib/dispatch';
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

/** Drive time left, from the last ELD reading. A reading more than 14 hours old is not trusted. */
function driveTimeFact(hours: number | null, updatedAt: string | null): RosterFact {
  if (updatedAt == null) return { label: 'Drive time left', value: <span className="font-normal text-muted-foreground">No ELD reading</span> };
  const age = formatDistanceToNow(new Date(updatedAt), { addSuffix: true }).replace('about ', '');
  if (Date.now() - new Date(updatedAt).getTime() > 14 * 3600 * 1000) {
    return { label: 'Drive time left', value: `Last reading ${age}`, tone: 'warn' };
  }
  if (hours == null) return { label: 'Drive time left', value: <span className="font-normal text-muted-foreground">No ELD reading</span> };
  return { label: 'Drive time left', value: `${hours} hours`, tone: hours <= 2 ? 'bad' : hours <= 6 ? 'warn' : 'good' };
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
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('first_name');

      if (driversError) throw driversError;

      // A driver is busy while holding an open load that is not past due.
      const { data: openLoads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('driver_id, status, delivery_date')
        .is('deleted_at', null)
        .in('status', [...OPEN_STATUSES]);

      if (loadsError) throw loadsError;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const busy = new Set(
        (openLoads ?? [])
          .filter((l) => !isPastDue(l, todayStr) && (l.status === 'assigned' || (ON_ROAD_STATUSES as readonly string[]).includes(l.status)))
          .map((l) => l.driver_id)
          .filter(Boolean),
      );

      // Approved hometime windows: active or upcoming within 14 days
      const horizonIso = format(addDays(new Date(), 14), 'yyyy-MM-dd');
      const { data: hometimeRows } = await supabase
        .from('driver_requests')
        .select('driver_id, start_date, end_date')
        .eq('request_type', 'home_time')
        .eq('status', 'approved')
        .not('start_date', 'is', null)
        .not('end_date', 'is', null)
        .gte('end_date', todayStr)
        .lte('start_date', horizonIso);

      const today = startOfDay(new Date());
      const hometimeByDriver = new Map<string, HometimeWindow[]>();
      for (const h of hometimeRows || []) {
        if (!h.driver_id || !h.start_date || !h.end_date) continue;
        const list = hometimeByDriver.get(h.driver_id) || [];
        list.push(h as HometimeWindow);
        hometimeByDriver.set(h.driver_id, list);
      }

      return driversData?.map((driver) => {
        const windows = hometimeByDriver.get(driver.id) || [];
        const active =
          windows.find((w) => {
            const s = startOfDay(parseISO(`${w.start_date}T00:00:00`));
            const e = startOfDay(parseISO(`${w.end_date}T00:00:00`));
            return today >= s && today <= e;
          }) || null;
        const upcoming = active
          ? null
          : windows.filter((w) => startOfDay(parseISO(`${w.start_date}T00:00:00`)) > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;

        return { ...driver, activeLoad: busy.has(driver.id), activeHometime: active, upcomingHometime: upcoming };
      }) as DriverWithLoad[];
    },
  });

  const expiring = (driver: Driver) => {
    const threshold = addDays(new Date(), 30);
    const out: string[] = [];
    if (driver.license_expiry && isBefore(new Date(driver.license_expiry), threshold)) out.push('license');
    if (driver.medical_card_expiry && isBefore(new Date(driver.medical_card_expiry), threshold)) out.push('medical card');
    if (driver.hazmat_expiry && isBefore(new Date(driver.hazmat_expiry), threshold)) out.push('hazmat');
    return out;
  };

  const chip = (label: string, cls: string) => (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}>{label}</span>
  );
  const range = (w: HometimeWindow) => `${format(parseISO(`${w.start_date}T00:00:00`), 'MMM d')} to ${format(parseISO(`${w.end_date}T00:00:00`), 'MMM d')}`;

  const onHometime = drivers?.filter((d) => d.activeHometime) ?? [];
  const onLoad = drivers?.filter((d) => d.activeLoad && !d.activeHometime) ?? [];
  const available = drivers?.filter((d) => !d.activeLoad && !d.activeHometime) ?? [];

  const entries: RosterEntry[] = (drivers ?? []).map((d) => {
    const eld = getEldSyncState(d.hos_last_updated);
    const creds = expiring(d);
    const state = d.activeHometime ? chip('On hometime', 'bg-purple-500/15 text-purple-600') : d.activeLoad ? chip('On a load', 'bg-primary/15 text-primary') : chip('Available', 'bg-success/15 text-success');
    return {
      id: d.id,
      title: `${d.first_name} ${d.last_name}`,
      onOpen: () => navigate('/drivers'),
      chips: (
        <>
          {state}
          {creds.length > 0 && chip(`Renew ${creds.join(', ')}`, 'bg-warning/15 text-warning')}
        </>
      ),
      subtitle: d.phone ?? undefined,
      facts: [
        driveTimeFact(d.remaining_drive_hours, d.hos_last_updated),
        { label: 'ELD', value: <span className={`font-normal ${eld.textClass}`}>{eld.label}</span> },
        d.activeHometime
          ? { label: 'Home until', value: format(parseISO(`${d.activeHometime.end_date}T00:00:00`), 'MMM d') }
          : d.upcomingHometime
            ? { label: 'Hometime', value: range(d.upcomingHometime), tone: 'warn' as const }
            : { label: 'Hometime', value: <span className="font-normal text-muted-foreground">None planned</span> },
      ],
    };
  });

  return (
    <Panel
      title="Drivers"
      description={isLoading ? 'Loading…' : `${available.length} available, ${onLoad.length} on a load${onHometime.length > 0 ? `, ${onHometime.length} on hometime` : ''}`}
      flush
      className="h-full"
      aside={<Button variant="outline" className="h-11" onClick={() => navigate('/drivers')}>All drivers</Button>}
    >
      {isLoading ? (
        <div className="space-y-3 border-t p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <Roster bordered={false} entries={entries} empty="No active drivers yet." />
      )}
    </Panel>
  );
}
