import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Loader2, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { StopTime } from '@/components/shared/StopTime';
import { getRelativeTimestamp } from './RelativeTimestamp';
import { calculateLoadPay } from '@/utils/payCalculations';
import { usePaySettings } from '@/hooks/usePaySettings';
import { useLoadProgress } from '@/hooks/useLoadProgress';
import { appointmentText, condensedAddress, statusLabel } from '@/lib/driver/load';
import { Chip, DBtn, Note, Panel, Segmented, Stat, StatCell, StatRow } from '@/components/driver/ui/driver-ui';
import { LoadDetailsSheet, type DetailsLoad } from './LoadDetailsSheet';
import { LoadProgressDialogs } from './LoadProgressDialogs';

interface Load extends DetailsLoad {
  rate: number | null;
  fuel_surcharge: number | null;
  driver_id: string | null;
  start_miles?: number | null;
  end_miles?: number | null;
  pod_required?: boolean;
}

const money = (value: number | null) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
const chipTone = (status: string) =>
  status === 'in_transit' ? 'active' : status === 'delivered' ? 'good' : status === 'cancelled' ? 'bad' : status === 'loading' ? 'warn' : 'neutral';

interface DriverLoadCardProps {
  load: Load;
  payRate: number;
  payType: string;
  onStatusUpdate: () => void;
}

function DriverLoadCard({ load, payRate, payType, onStatusUpdate }: DriverLoadCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const progress = useLoadProgress(load, onStatusUpdate);
  const paySettings = usePaySettings();
  const breakdown = calculateLoadPay(load as any, { pay_type: payType, pay_rate: payRate }, paySettings);
  const payLabel = breakdown.payType === 'flat' ? 'Accessorials' : 'Est. pay';
  const payText = breakdown.payType === 'flat' ? (breakdown.accessorialsTotal > 0 ? `+${money(breakdown.accessorialsTotal)}` : '-') : money(breakdown.total);

  const heading = load.status === 'in_transit' ? 'delivery' : 'pickup';
  const appt = load.status === 'in_transit'
    ? appointmentText(load.delivery_time_type, load.delivery_time, load.delivery_end_time)
    : appointmentText(load.pickup_time_type, load.pickup_time, load.pickup_end_time);

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <span className="text-sm text-muted-foreground">Load {load.landstar_load_id || 'N/A'}</span>
        <Chip tone={chipTone(load.status)}>{statusLabel(load.status)}</Chip>
      </div>

      <div className="px-4 pb-4 pt-2">
        <p className="flex flex-wrap items-center gap-x-2 font-condensed text-3xl font-bold leading-tight">
          <span title={load.origin}>{condensedAddress(load.origin)}</span>
          <ArrowRight className="h-6 w-6 shrink-0 text-muted-foreground" aria-label="to" />
          <span title={load.destination}>{condensedAddress(load.destination)}</span>
        </p>

        {load.status === 'cancelled' ? null : load.status === 'delivered' ? (
          <p className="mt-1.5 text-sm font-medium text-success">{getRelativeTimestamp(load.delivery_date, null)}</p>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="capitalize">{heading}</span>:{' '}
            <span className="font-medium text-foreground">
              <StopTime
                utcIso={heading === 'delivery' ? load.delivery_at : load.pickup_at}
                tz={heading === 'delivery' ? load.delivery_tz : load.pickup_tz}
                legacyDate={heading === 'delivery' ? load.delivery_date : load.pickup_date}
                legacyTime={heading === 'delivery' ? load.delivery_time : load.pickup_time}
                legacyEndTime={heading === 'delivery' ? load.delivery_end_time : load.pickup_end_time}
                withDate
                hideSecondary
              />
            </span>
            {appt ? `, ${appt.label.toLowerCase()}` : ''}
          </p>
        )}

        {['pending', 'assigned', 'loading'].includes(load.status) && load.pickup_number && (
          <div className="mt-3 rounded-lg bg-carbon/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">Pickup number</p>
            <p className="font-mono text-lg font-semibold tabular-nums">{load.pickup_number}</p>
          </div>
        )}
        {(load.trailers?.unit_number || load.trailer_id) && (
          <p className="mt-2 text-sm text-muted-foreground">Trailer <span className="font-mono font-medium text-foreground">{load.trailers?.unit_number || 'assigned'}</span></p>
        )}
      </div>

      <StatRow>
        <StatCell><Stat label="Miles">{load.booked_miles ? load.booked_miles.toLocaleString() : '-'}</Stat></StatCell>
        <StatCell><Stat label={payLabel}>{payText}</Stat></StatCell>
      </StatRow>

      <div className="flex gap-2 border-t border-border p-3">
        <DBtn tone="secondary" size="md" className="flex-1" onClick={() => setDetailsOpen(true)}>Details</DBtn>
        {progress.nextStatus && (
          <DBtn tone="primary" size="md" className="flex-[2]" onClick={progress.run} disabled={progress.isUpdating}>
            {progress.isUpdating ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {progress.isUpdating ? 'Updating' : progress.label}
          </DBtn>
        )}
      </div>

      <LoadDetailsSheet load={load} open={detailsOpen} onOpenChange={setDetailsOpen} payLabel={payLabel} payText={payText} />
      <LoadProgressDialogs progress={progress} load={load} onStatusUpdate={onStatusUpdate} />
    </Panel>
  );
}

type View = 'current' | 'upcoming' | 'completed';

export default function DriverLoadsView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<View>('current');

  // Fetch driver record for current user
  const { data: driverRecord } = useQuery({
    queryKey: ['driver_record', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from('drivers').select('*').eq('user_id', user.id).single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 15 * 60 * 1000,
  });

  // Fetch driver's loads, with their accessorials so the pay shown here matches the home screen.
  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['driver_loads', driverRecord?.id],
    queryFn: async () => {
      if (!driverRecord?.id) return [];
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, load_accessorials(*)')
        .eq('driver_id', driverRecord.id)
        .is('deleted_at', null);
      if (error) throw error;
      const rows = (data || []) as unknown as Load[];

      // Hydrate trailer unit numbers (no FK relationship for nested embed).
      const trailerIds = Array.from(new Set(rows.map((r) => r.trailer_id).filter((id): id is string => !!id)));
      let trailerMap = new Map<string, string | null>();
      if (trailerIds.length > 0) {
        const { data: trailerRows } = await supabase.from('trailers').select('id, unit_number').in('id', trailerIds);
        trailerMap = new Map((trailerRows || []).map((t) => [t.id, t.unit_number]));
      }
      return rows.map((r) => ({
        ...r,
        trailers: r.trailer_id ? { unit_number: trailerMap.get(r.trailer_id) ?? null } : null,
      }));
    },
    enabled: !!driverRecord?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Sort loads chronologically: in transit by delivery date, the rest by pickup date, earliest first.
  const sortLoadsChronologically = (loadsToSort: Load[]): Load[] =>
    [...loadsToSort].sort((a, b) => {
      const dateA = a.status === 'in_transit' ? (a.delivery_date || a.pickup_date || '') : (a.pickup_date || '');
      const dateB = b.status === 'in_transit' ? (b.delivery_date || b.pickup_date || '') : (b.pickup_date || '');
      const timeA = dateA ? new Date(dateA).getTime() : Infinity;
      const timeB = dateB ? new Date(dateB).getTime() : Infinity;
      return timeA - timeB;
    });

  const handleStatusUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['driver_loads'] });
    queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
    queryClient.invalidateQueries({ queryKey: ['driver-home/loads'] });
  };

  // Current: only in transit and loading (actively on the road). Upcoming: pending and assigned.
  const currentLoads = sortLoadsChronologically(loads.filter((l: Load) => ['loading', 'in_transit'].includes(l.status)));
  const upcomingLoads = sortLoadsChronologically(loads.filter((l: Load) => ['pending', 'assigned'].includes(l.status)));
  // Completed: most recent first.
  const completedLoads = [...loads.filter((l: Load) => ['delivered', 'cancelled'].includes(l.status))].sort((a, b) => {
    const dateA = a.delivery_date || a.pickup_date || '';
    const dateB = b.delivery_date || b.pickup_date || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const payRate = driverRecord?.pay_rate || 0;
  const payType = driverRecord?.pay_type || 'per_mile';

  if (!driverRecord) {
    return (
      <Panel className="px-4 py-10 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
        <h3 className="text-lg font-semibold">No driver profile</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Your account is not linked to a driver profile. Contact your dispatcher.</p>
      </Panel>
    );
  }

  const lists: Record<View, { loads: Load[]; empty: string }> = {
    current: { loads: currentLoads, empty: 'No current loads assigned.' },
    upcoming: { loads: upcomingLoads, empty: 'No upcoming loads scheduled.' },
    completed: { loads: completedLoads, empty: 'No completed loads yet.' },
  };
  const shown = lists[activeTab];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <Segmented<View>
        label="Which loads"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'current', label: 'Current', count: currentLoads.length },
          { value: 'upcoming', label: 'Upcoming', count: upcomingLoads.length },
          { value: 'completed', label: 'Completed', count: completedLoads.length },
        ]}
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>
      ) : shown.loads.length === 0 ? (
        <Panel><Note>{shown.empty}</Note></Panel>
      ) : (
        <div className="space-y-3">
          {shown.loads.map((load) => (
            <DriverLoadCard key={load.id} load={load} payRate={payRate} payType={payType} onStatusUpdate={handleStatusUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
