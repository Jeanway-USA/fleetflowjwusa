import { useEffect, useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';
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

export default function DriverSettlements() {
  const { data: driver, isLoading: driverLoading } = useDriverIdForUser();
  const driverId = driver?.id ?? null;

  const { data: settlements = [], isLoading: settlementsLoading } =
    useDriverSettlementsList(driverId);
  const { data: milesByPeriod = {} } = usePerSettlementMiles(driverId, settlements);
  const { data: ytd, isLoading: ytdLoading } = useYtdSnapshot(driverId);
  useSettlementsRealtimeRefresh(driverId);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default selection = most recent
  useEffect(() => {
    if (!selectedId && settlements.length > 0) {
      setSelectedId(settlements[0].id);
    }
  }, [settlements, selectedId]);

  // If the selected settlement disappears, fall back to the most recent.
  useEffect(() => {
    if (selectedId && !settlements.some((s) => s.id === selectedId)) {
      setSelectedId(settlements[0]?.id ?? null);
    }
  }, [settlements, selectedId]);

  const selected = useMemo(
    () => settlements.find((s) => s.id === selectedId) ?? null,
    [settlements, selectedId],
  );

  if (!driverLoading && !driver) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-muted/40 p-4 rounded-full mb-3">
          <Receipt className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          Driver profile not linked
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          We couldn't find a driver record tied to your account. Contact your dispatcher
          to get linked.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            My Settlements
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          1099 Owner-Operator pay statements, breakdowns, and year-to-date totals.
        </p>
      </header>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="lg:max-h-[calc(100vh-12rem)] lg:sticky lg:top-4">
          <SettlementHistoryList
            settlements={settlements}
            isLoading={settlementsLoading || driverLoading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            milesByPeriod={milesByPeriod}
          />
        </div>

        <div className="min-w-0">
          <SettlementDetailPanel settlement={selected} />
        </div>

        <div className="lg:sticky lg:top-4">
          <TaxAndYtdPanel
            settlements={settlements}
            ytd={ytd}
            ytdLoading={ytdLoading}
          />
        </div>
      </div>
    </div>
  );
}
