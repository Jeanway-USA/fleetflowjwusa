import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval, startOfWeek, endOfWeek, startOfQuarter, startOfYear, subDays, getDate, addWeeks } from 'date-fns';

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
}

export interface FleetLoad {
  id: string;
  driver_id: string | null;
  delivery_date: string | null;
  status: string;
  net_revenue: number | null;
  actual_miles: number | null;
  booked_miles: number | null;
}

export interface Inspection {
  id: string;
  driver_id: string;
  inspection_date: string;
  defects_found: boolean;
}

export interface Incident {
  id: string;
  driver_id: string | null;
  incident_date: string;
  severity: string;
}

export interface FuelPurchase {
  id: string;
  driver_id: string | null;
  gallons: number;
  total_cost: number;
  purchase_date: string;
}

export interface DriverMetric {
  driver: Driver;
  totalLoads: number;
  totalMiles: number;
  totalRevenue: number;
  onTimeRate: number;
  dvirCompliance: number;
  incidentCount: number;
  productivityScore: number;
  safetyScore: number;
  complianceScore: number;
  revenueScore: number;
  overallScore: number;
  revenuePerMile: number;
  mpg: number | null;
  fuelCostPerMile: number | null;
  bonusWeeks: number;
  baselineMonthlyMiles: number;
  currentMonthMiles: number;
  retentionFlag: boolean;
  retentionDropPct: number;
}

export type PerformancePeriod = 'current' | 'last' | 'last3' | 'week' | '30d' | 'ytd';

export function getPeriodRange(period: PerformancePeriod) {
  const now = new Date();
  switch (period) {
    case 'current':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last':
      return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    case 'last3':
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case '30d':
      return { start: subDays(now, 30), end: now };
    case 'ytd':
      return { start: startOfYear(now), end: now };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

export function useDriverPerformanceData(selectedPeriod: PerformancePeriod) {
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers_public_view').select('*').eq('status', 'active');
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*');
      if (error) throw error;
      return data as FleetLoad[];
    },
  });

  // DVIR inspections feature removed; keep stub for downstream metrics
  const inspections: Inspection[] = [];


  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('incidents').select('*');
      if (error) throw error;
      return data as Incident[];
    },
  });

  const { data: fuelPurchases = [] } = useQuery({
    queryKey: ['fuel_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fuel_purchases').select('*');
      if (error) throw error;
      return data as FuelPurchase[];
    },
  });

  const driverMetrics = useMemo(() => {
    const { start, end } = getPeriodRange(selectedPeriod);
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const dayOfMonth = getDate(now);
    // Trailing 6 completed months (exclude current)
    const baselineStart = startOfMonth(subMonths(now, 6));
    const baselineEnd = endOfMonth(subMonths(now, 1));
    // 4 completed weeks preceding the current week
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });

    return drivers.map(driver => {
      const driverLoads = loads.filter(load => {
        if (load.driver_id !== driver.id || !load.delivery_date) return false;
        const date = parseISO(load.delivery_date);
        return isWithinInterval(date, { start, end }) && load.status === 'delivered';
      });

      const driverInspections = inspections.filter(insp => {
        if (insp.driver_id !== driver.id) return false;
        const date = parseISO(insp.inspection_date);
        return isWithinInterval(date, { start, end });
      });

      const driverIncidents = incidents.filter(inc => {
        if (inc.driver_id !== driver.id || !inc.incident_date) return false;
        const date = parseISO(inc.incident_date);
        return isWithinInterval(date, { start, end });
      });

      const driverFuel = fuelPurchases.filter(fp => {
        if (fp.driver_id !== driver.id || !fp.purchase_date) return false;
        const date = parseISO(fp.purchase_date);
        return isWithinInterval(date, { start, end });
      });

      const totalLoads = driverLoads.length;
      const totalMiles = driverLoads.reduce((sum, l) => sum + (l.actual_miles || 0), 0);
      const totalRevenue = driverLoads.reduce((sum, l) => sum + (l.net_revenue || 0), 0);

      const totalInspections = driverInspections.length;
      const cleanInspections = driverInspections.filter(i => !i.defects_found).length;
      const dvirCompliance = totalInspections > 0 ? (cleanInspections / totalInspections) * 100 : 100;

      const incidentCount = driverIncidents.length;
      const severeIncidents = driverIncidents.filter(i => i.severity === 'major' || i.severity === 'critical').length;

      const totalGallons = driverFuel.reduce((sum, f) => sum + (f.gallons || 0), 0);
      const totalFuelCost = driverFuel.reduce((sum, f) => sum + (f.total_cost || 0), 0);
      const mpg = totalGallons > 0 && totalMiles > 0 ? totalMiles / totalGallons : null;
      const fuelCostPerMile = totalMiles > 0 && totalFuelCost > 0 ? totalFuelCost / totalMiles : null;

      // Bonus milestone: 4 consecutive completed weeks with ≥1 delivered load and 0 incidents.
      let bonusWeeks = 0;
      for (let i = 1; i <= 4; i++) {
        const wkStart = addWeeks(currentWeekStart, -i);
        const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
        const hadLoad = loads.some(l => {
          if (l.driver_id !== driver.id || !l.delivery_date || l.status !== 'delivered') return false;
          const d = parseISO(l.delivery_date);
          return isWithinInterval(d, { start: wkStart, end: wkEnd });
        });
        const hadIncident = incidents.some(inc => {
          if (inc.driver_id !== driver.id || !inc.incident_date) return false;
          const d = parseISO(inc.incident_date);
          return isWithinInterval(d, { start: wkStart, end: wkEnd });
        });
        if (hadLoad && !hadIncident) bonusWeeks++;
        else break;
      }

      // Baseline monthly miles (trailing 6 completed months) and current-month miles
      const monthBuckets = new Map<string, number>();
      let currentMonthMiles = 0;
      loads.forEach(l => {
        if (l.driver_id !== driver.id || !l.delivery_date || l.status !== 'delivered') return;
        const d = parseISO(l.delivery_date);
        const miles = l.actual_miles || 0;
        if (isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd })) {
          currentMonthMiles += miles;
        }
        if (isWithinInterval(d, { start: baselineStart, end: baselineEnd })) {
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          monthBuckets.set(key, (monthBuckets.get(key) || 0) + miles);
        }
      });
      const monthsWithData = monthBuckets.size;
      const baselineMonthlyMiles = monthsWithData > 0
        ? Array.from(monthBuckets.values()).reduce((s, v) => s + v, 0) / monthsWithData
        : 0;
      const retentionDropPct = baselineMonthlyMiles > 0
        ? Math.max(0, ((baselineMonthlyMiles - currentMonthMiles) / baselineMonthlyMiles) * 100)
        : 0;
      const retentionFlag =
        monthsWithData >= 2 &&
        baselineMonthlyMiles > 0 &&
        dayOfMonth >= 10 &&
        retentionDropPct > 25;

      // Scores (0-100)
      const productivityScore = Math.min(100, (totalLoads / 10) * 100);
      const safetyScore = Math.max(0, 100 - (incidentCount * 10) - (severeIncidents * 20));
      const complianceScore = dvirCompliance;
      const revenueScore = Math.min(100, (totalRevenue / 20000) * 100);
      const overallScore = (productivityScore + safetyScore + complianceScore + revenueScore) / 4;

      return {
        driver,
        totalLoads,
        totalMiles,
        totalRevenue,
        onTimeRate: totalLoads > 0 ? 100 : 0,
        dvirCompliance,
        incidentCount,
        productivityScore,
        safetyScore,
        complianceScore,
        revenueScore,
        overallScore,
        revenuePerMile: totalMiles > 0 ? totalRevenue / totalMiles : 0,
        mpg,
        fuelCostPerMile,
        bonusWeeks,
        baselineMonthlyMiles,
        currentMonthMiles,
        retentionFlag,
        retentionDropPct,
      };
    }).sort((a, b) => b.overallScore - a.overallScore);
  }, [drivers, loads, inspections, incidents, fuelPurchases, selectedPeriod]);


  const fleetAverages = useMemo(() => {
    if (driverMetrics.length === 0) return { loads: 0, miles: 0, revenue: 0, score: 0 };
    return {
      loads: driverMetrics.reduce((s, d) => s + d.totalLoads, 0) / driverMetrics.length,
      miles: driverMetrics.reduce((s, d) => s + d.totalMiles, 0) / driverMetrics.length,
      revenue: driverMetrics.reduce((s, d) => s + d.totalRevenue, 0) / driverMetrics.length,
      score: driverMetrics.reduce((s, d) => s + d.overallScore, 0) / driverMetrics.length,
    };
  }, [driverMetrics]);

  return { drivers, driverMetrics, fleetAverages };
}
