import { useEffect, useMemo, useState } from 'react';
import {
  useDriverIdForUser,
  useDriverSettlementsList,
  usePerSettlementMiles,
  useSettlementsRealtimeRefresh,
  useYtdSnapshot,
} from '@/hooks/useDriverSettlementsPage';
import { SettlementHistoryList } from '@/components/driver/settlements/SettlementHistoryList';
import { SettlementDetailPanel } from '@/components/driver/settlements/SettlementDetailPanel';
import { TaxAndYtdPanel } from '@/components/driver/settlements/TaxAndYtdPanel';
import { Panel } from '@/components/driver/ui/driver-ui';

export default function DriverSettlements() {
  const { data: driver, isLoading: driverLoading } = useDriverIdForUser();
  const driverId = driver?.id ?? null;

  const { data: settlements = [], isLoading: settlementsLoading } = useDriverSettlementsList(driverId);
  const { data: milesByPeriod = {} } = usePerSettlementMiles(driverId, settlements);
  const { data: ytd, isLoading: ytdLoading } = useYtdSnapshot(driverId);
  useSettlementsRealtimeRefresh(driverId);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default selection = most recent
  useEffect(() => {
    if (!selectedId && settlements.length > 0) setSelectedId(settlements[0].id);
  }, [settlements, selectedId]);

  // If the selected settlement disappears, fall back to the most recent.
  useEffect(() => {
    if (selectedId && !settlements.some((s) => s.id === selectedId)) setSelectedId(settlements[0]?.id ?? null);
  }, [settlements, selectedId]);

  const selected = useMemo(() => settlements.find((s) => s.id === selectedId) ?? null, [settlements, selectedId]);

  if (!driverLoading && !driver) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <Panel className="px-4 py-10 text-center">
          <h2 className="text-lg font-semibold">Driver profile not linked</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">We couldn't find a driver record tied to your account. Contact your dispatcher to get linked.</p>
        </Panel>
      </div>
    );
  }

  const choose = (id: string) => {
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
      <div className="px-1 pt-1">
        <h1 className="text-2xl font-semibold leading-tight">My pay</h1>
        <p className="text-sm text-muted-foreground">Your pay statements, year to date, and tax forms.</p>
      </div>

      <SettlementDetailPanel settlement={selected} />
      <SettlementHistoryList settlements={settlements} isLoading={settlementsLoading || driverLoading} selectedId={selectedId} onSelect={choose} milesByPeriod={milesByPeriod} />
      <TaxAndYtdPanel settlements={settlements} ytd={ytd} ytdLoading={ytdLoading} />
    </div>
  );
}
