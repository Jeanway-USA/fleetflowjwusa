import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfWeek, addWeeks, subDays, isAfter, startOfMonth, endOfMonth, getDaysInMonth } from 'date-fns';
import { TOTAL_FIXED_OVERHEAD_MONTHLY } from '@/config/fixedOverhead';

export interface PeriodRollup {
  revenue: number;
  costs: number;
  miles: number;
}

export interface WeekPoint {
  weekStart: string; // YYYY-MM-DD
  label: string;
  revenue: number;
  costs: number;
  net: number;
}

export interface RunwayMetrics {
  fixedMonthly: number;
  avgFleetMpg: number;
  fuelPricePerGallon: number;
  plannedMilesPerDay: number;
  plannedDispatchDays: number;
  projectedFuelMonthly: number;
  costPerDay: number;
  monthToDateRevenue: number;
  monthToDateDays: number;
  breakEvenMTD: number;
}

export interface PLTrendData {
  week: PeriodRollup;
  month: PeriodRollup;
  quarter: PeriodRollup;
  weekly: WeekPoint[];
  runway: RunwayMetrics;
}

export interface UsePLTrendOptions {
  fuelPricePerGallon?: number;
  plannedMilesPerDay?: number;
  plannedDispatchDays?: number;
}

const WEEKS = 12;
const DEFAULT_FUEL_PRICE = 4.10;
const DEFAULT_MILES_PER_DAY = 450;
const DEFAULT_DISPATCH_DAYS = 22;
const DEFAULT_MPG = 6.5;

const safeDate = (d: string | null | undefined): Date | null => {
  if (!d) return null;
  try {
    return parseISO(`${d.slice(0, 10)}T00:00:00`);
  } catch {
    return null;
  }
};

export function usePLTrend(options: UsePLTrendOptions = {}) {
  const {
    fuelPricePerGallon = DEFAULT_FUEL_PRICE,
    plannedMilesPerDay = DEFAULT_MILES_PER_DAY,
    plannedDispatchDays = DEFAULT_DISPATCH_DAYS,
  } = options;

  return useQuery<PLTrendData>({
    queryKey: ['pl-trend', WEEKS, fuelPricePerGallon, plannedMilesPerDay, plannedDispatchDays],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const today = new Date();
      const horizonStart = startOfWeek(subDays(today, 7 * (WEEKS - 1)), { weekStartsOn: 1 });
      const horizonIso = format(horizonStart, 'yyyy-MM-dd');
      const mpgHorizonIso = format(subDays(today, 90), 'yyyy-MM-dd');

      const [loadsRes, expensesRes, payrollRes, commissionsRes, fuelRes] = await Promise.all([
        supabase
          .from('fleet_loads')
          .select('delivery_date, gross_revenue, actual_miles, booked_miles, status')
          .gte('delivery_date', horizonIso),
        supabase
          .from('expenses')
          .select('expense_date, amount')
          .gte('expense_date', horizonIso),
        supabase
          .from('driver_payroll')
          .select('period_end, net_pay')
          .gte('period_end', horizonIso),
        supabase
          .from('agent_commissions')
          .select('created_at, commission_amount')
          .gte('created_at', horizonIso),
        supabase
          .from('fuel_purchases')
          .select('purchase_date, gallons')
          .gte('purchase_date', mpgHorizonIso),
      ]);

      const loads = loadsRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const payroll = payrollRes.data ?? [];
      const commissions = commissionsRes.data ?? [];
      const fuel = fuelRes.data ?? [];

      // Build 12 weekly buckets
      const buckets: WeekPoint[] = Array.from({ length: WEEKS }, (_, i) => {
        const start = addWeeks(horizonStart, i);
        return {
          weekStart: format(start, 'yyyy-MM-dd'),
          label: format(start, 'MMM d'),
          revenue: 0,
          costs: 0,
          net: 0,
        };
      });

      const bucketIndex = (d: Date): number => {
        const weekStart = startOfWeek(d, { weekStartsOn: 1 });
        const diffDays = Math.floor((weekStart.getTime() - horizonStart.getTime()) / 86_400_000);
        const idx = Math.floor(diffDays / 7);
        return idx >= 0 && idx < WEEKS ? idx : -1;
      };

      // Track miles over trailing 90 days for MPG
      const mpgCutoff = subDays(today, 90);
      let miles90 = 0;

      for (const l of loads as any[]) {
        const d = safeDate(l.delivery_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx < 0) continue;
        const rev = Number(l.gross_revenue) || 0;
        const miles = Number(l.actual_miles ?? l.booked_miles) || 0;
        buckets[idx].revenue += rev;
        if (isAfter(d, mpgCutoff)) miles90 += miles;
      }
      for (const c of commissions as any[]) {
        const d = safeDate(c.created_at);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx < 0) continue;
        buckets[idx].revenue += Number(c.commission_amount) || 0;
      }
      for (const e of expenses as any[]) {
        const d = safeDate(e.expense_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx < 0) continue;
        buckets[idx].costs += Number(e.amount) || 0;
      }
      for (const p of payroll as any[]) {
        const d = safeDate(p.period_end);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx < 0) continue;
        buckets[idx].costs += Number(p.net_pay) || 0;
      }

      for (const b of buckets) b.net = b.revenue - b.costs;

      const rollup = (days: number): PeriodRollup => {
        const cutoff = subDays(today, days);
        let revenue = 0,
          costs = 0,
          miles = 0;
        for (const l of loads as any[]) {
          const d = safeDate(l.delivery_date);
          if (d && isAfter(d, cutoff)) {
            revenue += Number(l.gross_revenue) || 0;
            miles += Number(l.actual_miles ?? l.booked_miles) || 0;
          }
        }
        for (const c of commissions as any[]) {
          const d = safeDate(c.created_at);
          if (d && isAfter(d, cutoff)) revenue += Number(c.commission_amount) || 0;
        }
        for (const e of expenses as any[]) {
          const d = safeDate(e.expense_date);
          if (d && isAfter(d, cutoff)) costs += Number(e.amount) || 0;
        }
        for (const p of payroll as any[]) {
          const d = safeDate(p.period_end);
          if (d && isAfter(d, cutoff)) costs += Number(p.net_pay) || 0;
        }
        return { revenue, costs, miles };
      };

      // === Runway ===
      const gallons90 = fuel.reduce((sum: number, f: any) => sum + (Number(f.gallons) || 0), 0);
      const avgFleetMpg = gallons90 > 0 && miles90 > 0 ? miles90 / gallons90 : DEFAULT_MPG;
      const projectedMonthlyMiles = plannedMilesPerDay * plannedDispatchDays;
      const projectedFuelMonthly = avgFleetMpg > 0
        ? (projectedMonthlyMiles / avgFleetMpg) * fuelPricePerGallon
        : 0;
      const fixedMonthly = TOTAL_FIXED_OVERHEAD_MONTHLY;
      const costPerDay = plannedDispatchDays > 0
        ? (fixedMonthly + projectedFuelMonthly) / plannedDispatchDays
        : 0;

      // Month-to-date
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const daysInMonth = getDaysInMonth(today);
      const dayOfMonth = Math.min(today.getDate(), daysInMonth);
      let monthToDateRevenue = 0;
      for (const l of loads as any[]) {
        const d = safeDate(l.delivery_date);
        if (d && d >= monthStart && d <= monthEnd) {
          monthToDateRevenue += Number(l.gross_revenue) || 0;
        }
      }
      for (const c of commissions as any[]) {
        const d = safeDate(c.created_at);
        if (d && d >= monthStart && d <= monthEnd) {
          monthToDateRevenue += Number(c.commission_amount) || 0;
        }
      }
      const monthToDateDays = Math.max(
        1,
        Math.round((plannedDispatchDays * dayOfMonth) / daysInMonth),
      );
      const breakEvenMTD = costPerDay * monthToDateDays;

      return {
        week: rollup(7),
        month: rollup(30),
        quarter: rollup(90),
        weekly: buckets,
        runway: {
          fixedMonthly,
          avgFleetMpg,
          fuelPricePerGallon,
          plannedMilesPerDay,
          plannedDispatchDays,
          projectedFuelMonthly,
          costPerDay,
          monthToDateRevenue,
          monthToDateDays,
          breakEvenMTD,
        },
      };
    },
  });
}
