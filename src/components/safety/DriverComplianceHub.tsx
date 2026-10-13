import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Panel } from '@/components/finance/statement-ui';
import { Roster, expiryFact, type RosterEntry } from '@/components/fleet/Roster';

export function DriverComplianceHub() {
  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers-compliance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status, license_expiry, medical_card_expiry, mvr_expiry')
        .is('deleted_at', null)
        .order('last_name');
      if (error) throw error;
      return data;
    },
  });

  const entries: RosterEntry[] = drivers.map((driver) => ({
    id: driver.id,
    title: `${driver.first_name} ${driver.last_name}`,
    chips: <StatusBadge status={driver.status} />,
    facts: [
      expiryFact('CDL expires', driver.license_expiry),
      expiryFact('Medical card expires', driver.medical_card_expiry),
      expiryFact('Annual MVR', (driver as any).mvr_expiry),
    ],
  }));

  return (
    <Panel
      title="Driver credentials"
      description="CDL, medical card and annual MVR. Amber means due within 30 days, red means expired."
      className="mb-5"
      flush
    >
      {isLoading ? (
        <div className="flex items-center justify-center border-t py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Roster entries={entries} bordered={false} empty="No drivers found" />
      )}
    </Panel>
  );
}
