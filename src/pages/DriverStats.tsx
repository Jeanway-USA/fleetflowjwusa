import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfWeek, endOfWeek, startOfYear, endOfYear, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { calculateWeeklyPay } from '@/utils/payCalculations';
import { usePaySettings } from '@/hooks/usePaySettings';
import { Bar, Note, Panel, PanelHead, Row, Segmented, Stat, StatCell, StatRow } from '@/components/driver/ui/driver-ui';

type PeriodType = 'weekly' | 'monthly' | 'annual';

const PERIOD_LABEL: Record<PeriodType, string> = { weekly: 'This week', monthly: 'This month', annual: 'This year' };

/** Four figures in a two-by-two block, hairlines between. */
function FigureGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-px border-t border-border bg-border [&>*]:bg-card [&>*]:px-4 [&>*]:py-3">{children}</div>;
}

export default function DriverStats() {
  const { user } = useAuth();
  const paySettings = usePaySettings();
  const [period, setPeriod] = useState<PeriodType>('weekly');

  // Fetch driver record
  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: ['driver-stats-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').eq('user_id', user?.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // The driver's own pay-week start day (looked up by driver, not by login).
  const { data: driverSettings } = useQuery({
    queryKey: ['driver-stats-settings', driver?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('driver_settings_safe' as any) as any)
        .select('pay_week_start_day')
        .eq('driver_id', driver?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  const weekStartsOn = (driverSettings?.pay_week_start_day ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  const getDateRange = (periodType: PeriodType) => {
    const now = new Date();
    switch (periodType) {
      case 'weekly':
        return { start: format(startOfWeek(now, { weekStartsOn }), 'yyyy-MM-dd'), end: format(endOfWeek(now, { weekStartsOn }), 'yyyy-MM-dd') };
      case 'monthly':
        return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
      case 'annual':
        return { start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(endOfYear(now), 'yyyy-MM-dd') };
    }
  };

  const dateRange = getDateRange(period);

  // Fetch assigned truck
  const { data: assignedTruck } = useQuery({
    queryKey: ['driver-stats-truck', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('*').eq('current_driver_id', driver?.id).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  // Fetch assigned trailer
  const { data: assignedTrailer } = useQuery({
    queryKey: ['driver-stats-trailer', driver?.id],
    queryFn: async () => {
      // Get most recent trailer assignment
      const { data, error } = await supabase
        .from('trailer_assignments')
        .select('*, trailers(*)')
        .eq('driver_id', driver?.id)
        .is('released_at', null)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data?.trailers;
    },
    enabled: !!driver?.id,
  });

  // Fetch delivered loads for the period
  const { data: periodLoads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ['driver-stats-loads', driver?.id, dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, load_accessorials(*)')
        .eq('driver_id', driver?.id)
        .eq('status', 'delivered')
        .is('deleted_at', null)
        .gte('delivery_date', dateRange.start)
        .lte('delivery_date', dateRange.end);
      if (error) throw error;
      return data || [];
    },
    enabled: !!driver?.id,
  });

  // Fetch fuel purchases for the period
  const { data: fuelPurchases = [] } = useQuery({
    queryKey: ['driver-stats-fuel', driver?.id, dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_purchases')
        .select('gallons, total_cost, price_per_gallon')
        .eq('driver_id', driver?.id)
        .gte('purchase_date', dateRange.start)
        .lte('purchase_date', dateRange.end);
      if (error) throw error;
      return data || [];
    },
    enabled: !!driver?.id,
  });

  // Calculate statistics
  const calculateStats = () => {
    let totalLoadedMiles = 0;
    let totalEmptyMiles = 0;

    periodLoads.forEach((load: any) => {
      const loadedMiles = (load.actual_miles && load.actual_miles > 0) ? load.actual_miles : (load.booked_miles || 0);
      totalLoadedMiles += loadedMiles;
      totalEmptyMiles += load.empty_miles || 0;
    });

    // Earnings: single source of truth shared with DriverPayWidget
    const weekly = calculateWeeklyPay({
      loads: periodLoads as any,
      driver: { pay_type: driver?.pay_type, pay_rate: driver?.pay_rate },
      settings: paySettings,
    });
    const totalEarnings = weekly.total;

    const totalLoads = periodLoads.length;
    const totalMiles = totalLoadedMiles + totalEmptyMiles;
    const loadedPercentage = totalMiles > 0 ? (totalLoadedMiles / totalMiles) * 100 : 100;
    const revenuePerLoadedMile = totalLoadedMiles > 0 ? totalEarnings / totalLoadedMiles : 0;

    return { totalLoads, totalLoadedMiles, totalEmptyMiles, totalMiles, totalEarnings, loadedPercentage, revenuePerLoadedMile };
  };

  const stats = calculateStats();
  const isFlatPay = driver?.pay_type === 'flat';

  // Calculate fuel statistics
  const fuelStats = (() => {
    const totalGallons = fuelPurchases.reduce((sum: number, fp: any) => sum + (fp.gallons || 0), 0);
    const totalFuelCost = fuelPurchases.reduce((sum: number, fp: any) => sum + (fp.total_cost || 0), 0);
    const mpg = totalGallons > 0 ? stats.totalMiles / totalGallons : 0;
    const costPerMile = stats.totalMiles > 0 ? totalFuelCost / stats.totalMiles : 0;
    const mpgLabel = mpg >= 6.5 ? 'Good' : mpg >= 5.5 ? 'Average' : 'Low';
    const mpgColor = mpg >= 6.5 ? 'text-success' : mpg >= 5.5 ? 'text-warning' : 'text-destructive';
    return { totalGallons, totalFuelCost, mpg, costPerMile, mpgLabel, mpgColor };
  })();

  const isLoading = driverLoading || loadsLoading;


  const header = (
    <div className="px-1 pt-1">
      <h1 className="text-2xl font-semibold leading-tight">My stats</h1>
      <p className="text-sm text-muted-foreground">How your weeks, months and year are going.</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
        {header}
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
        {header}
        <Panel><Note>Driver profile not found. Contact an administrator.</Note></Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
      {header}

      <Segmented<PeriodType>
        label="Time period"
        value={period}
        onChange={setPeriod}
        options={(Object.keys(PERIOD_LABEL) as PeriodType[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
      />

      <Panel>
        <PanelHead title={PERIOD_LABEL[period]} aside={`${format(parseISO(dateRange.start + 'T00:00:00'), 'MMM d')} to ${format(parseISO(dateRange.end + 'T00:00:00'), 'MMM d, yyyy')}`} />
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground">Earnings</p>
          {isFlatPay ? (
            <>
              <p className="font-condensed text-4xl font-bold leading-tight text-muted-foreground">-</p>
              <p className="text-xs text-muted-foreground">Flat-rate pay. See payroll.</p>
            </>
          ) : (
            <p className="font-condensed text-5xl font-bold leading-tight tabular-nums text-success">
              ${stats.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
        <StatRow>
          <StatCell><Stat label="Loads delivered">{stats.totalLoads}</Stat></StatCell>
          <StatCell><Stat label="Total miles">{stats.totalMiles.toLocaleString()}</Stat></StatCell>
        </StatRow>
        <StatRow>
          <StatCell><Stat label="Avg per load">{!isFlatPay && stats.totalLoads > 0 ? `$${(stats.totalEarnings / stats.totalLoads).toFixed(0)}` : '-'}</Stat></StatCell>
          <StatCell><Stat label="Pay per loaded mile">{!isFlatPay && stats.totalLoadedMiles > 0 ? `$${stats.revenuePerLoadedMile.toFixed(2)}` : '-'}</Stat></StatCell>
        </StatRow>
      </Panel>

      <Panel>
        <PanelHead title="Miles" />
        <StatRow className="border-t-0">
          <StatCell><Stat label="Loaded" size="lg">{stats.totalLoadedMiles.toLocaleString()}</Stat></StatCell>
          <StatCell><Stat label="Empty (deadhead)" size="lg">{stats.totalEmptyMiles.toLocaleString()}</Stat></StatCell>
        </StatRow>
        <div className="border-t border-border px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">Loaded percentage</span>
            <span className="text-sm font-semibold tabular-nums">{stats.loadedPercentage.toFixed(1)}%</span>
          </div>
          <Bar className="mt-2" value={stats.loadedPercentage} max={100} label="Share of miles driven loaded" />
          <p className="mt-2 text-xs text-muted-foreground">A higher share means better routing and less deadhead.</p>
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Fuel and efficiency" />
        {fuelPurchases.length === 0 ? (
          <Note>No fuel purchases recorded for this period.</Note>
        ) : (
          <>
            <FigureGrid>
              <Stat label="Gallons">{fuelStats.totalGallons.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</Stat>
              <Stat label="Fuel cost">${fuelStats.totalFuelCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Stat>
              <div>
                <p className="text-xs text-muted-foreground">Average MPG</p>
                <p className="mt-0.5 flex items-baseline gap-2 text-base font-semibold tabular-nums">
                  {fuelStats.mpg.toFixed(1)} <span className={`text-xs font-medium ${fuelStats.mpgColor}`}>{fuelStats.mpgLabel}</span>
                </p>
              </div>
              <Stat label="Cost per mile">${fuelStats.costPerMile.toFixed(2)}</Stat>
            </FigureGrid>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">MPG is total miles (loaded and empty) divided by gallons bought. Aim for 6.5 or better.</p>
          </>
        )}
      </Panel>

      <Panel>
        <PanelHead title="My equipment" />
        <Row label="Truck">{assignedTruck ? `#${assignedTruck.unit_number}` : 'Not assigned'}</Row>
        {assignedTruck && (
          <>
            <Row label="Make and model">{[assignedTruck.year, assignedTruck.make, assignedTruck.model].filter(Boolean).join(' ') || '-'}</Row>
            <Row label="VIN"><span className="font-mono text-xs">{assignedTruck.vin || '-'}</span></Row>
            <Row label="Plate">{assignedTruck.license_plate ? `${assignedTruck.license_plate} (${assignedTruck.license_plate_state})` : '-'}</Row>
          </>
        )}
        <Row label="Trailer">{assignedTrailer ? `#${assignedTrailer.unit_number}` : 'Not assigned'}</Row>
        {assignedTrailer && (
          <>
            <Row label="Type">{assignedTrailer.trailer_type || '-'}</Row>
            <Row label="VIN"><span className="font-mono text-xs">{assignedTrailer.vin || '-'}</span></Row>
          </>
        )}
      </Panel>
    </div>
  );
}
