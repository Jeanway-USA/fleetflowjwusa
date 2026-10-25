import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { Panel } from '@/components/finance/statement-ui';
import { Roster, expiryFact, type RosterEntry } from '@/components/fleet/Roster';
import { getEldSyncState } from './eldSync';

interface TruckData {
  id: string;
  unit_number: string;
  status: string;
  next_inspection_date: string | null;
  current_driver: { first_name: string; last_name: string; hos_last_updated: string | null } | null;
}

const STATUS: Record<string, { label: string; className: string }> = {
  active: { label: 'In service', className: 'bg-success/15 text-success' },
  in_shop: { label: 'In the shop', className: 'bg-warning/15 text-warning' },
  out_of_service: { label: 'Out of service', className: 'bg-destructive/15 text-destructive' },
};

export function TruckStatusGrid() {
  const navigate = useNavigate();

  const { data: trucks, isLoading } = useQuery({
    queryKey: ['trucks-status-dispatcher'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select(`
          id,
          unit_number,
          status,
          next_inspection_date,
          current_driver:drivers!trucks_current_driver_id_fkey(first_name, last_name, hos_last_updated)
        `)
        .is('deleted_at', null)
        .order('unit_number');

      if (error) throw error;
      return data as TruckData[];
    },
  });

  const inService = trucks?.filter((t) => t.status === 'active').length ?? 0;
  const inShop = trucks?.filter((t) => t.status === 'in_shop').length ?? 0;

  const entries: RosterEntry[] = (trucks ?? []).map((truck) => {
    const state = STATUS[truck.status] ?? STATUS.active;
    const eld = truck.current_driver ? getEldSyncState(truck.current_driver.hos_last_updated) : null;
    return {
      id: truck.id,
      title: `Unit ${truck.unit_number}`,
      onOpen: () => navigate('/trucks'),
      chips: <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${state.className}`}>{state.label}</span>,
      facts: [
        { label: 'Driver', value: truck.current_driver ? `${truck.current_driver.first_name} ${truck.current_driver.last_name}` : <span className="font-normal text-muted-foreground">Unassigned</span> },
        { label: 'ELD', value: eld ? <span className={`font-normal ${eld.textClass}`}>{eld.label}</span> : <span className="font-normal text-muted-foreground">No ELD paired</span> },
        expiryFact('Inspection due', truck.next_inspection_date, 14),
      ],
    };
  });

  return (
    <Panel
      title="Trucks"
      description={isLoading ? 'Loading…' : `${inService} in service, ${inShop} in the shop`}
      flush
      className="h-full"
      aside={<Button variant="outline" className="h-11" onClick={() => navigate('/trucks')}>All trucks</Button>}
    >
      {isLoading ? (
        <div className="space-y-3 border-t p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <Roster bordered={false} entries={entries} empty="No trucks yet." />
      )}
    </Panel>
  );
}
