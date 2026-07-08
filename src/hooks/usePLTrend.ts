import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  format,
  parseISO,
  startOfWeek,
  addWeeks,
  subDays,
  isAfter,
  startOfMonth,
  endOfMonth,
} from 'date-fns';

export interface PeriodRollup {
  revenue: number;
  costs: number;
  miles: number;
}

export interface WeekPoint {
  weekStart: string;
  label: string;
  revenue: number;
  costs: number;
  net: number;
}

export interface FixedOverheadEntry {
  expenseType: string;
  monthlyAmount: number;
}

export interface RunwayMetrics {
  fixedMonthly: number;
  fixedBreakdown: FixedOverheadEntry[];
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

const WEEKS = 12;

// Recurring overhead types drawn from the org's own expenses table.
const RECURRING_OVERHEAD_TYPES = new Set([
  'Truck Payment',
  'Trailer Payment',
  'Licensing/Permits',
  'Registration/Plates',
  'Insurance',
  'LCN/Satellite',
  'Cell Phone',
  'Truck Warranty',
  'CPP/Benefits',
  'IFTA',
]);

const safeDate = (d: string | null | undefined): Date | null => {
  if (!d) return null;
  try {
    return parseISO(`${d.slice(0, 10)}T00:00:00`);
  } catch {
    return null;
  }
};

export function usePLTrend() {
  return useQuery<PLTrendData>({
    queryKey: ['pl-trend', WEEKS],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const today = new Date();
      const horizonStart = startOfWeek(subDays(today, 7 * (WEEKS - 1)), { weekStartsOn: 1 });
      const horizonIso = format(horizonStart, 'yyyy-MM-dd');
      const trailing90Iso = format(subDays(today, 90), 'yyyy-MM-dd');
      const trailing30Iso = format(subDays(today, 30), 'yyyy-MM-dd');

      const [loadsRes, expensesRes, payrollRes, commissionsRes, fuelRes] = await Promise.all([
        supabase
          .from('fleet_loads')
          .select('delivery_date, gross_revenue, actual_miles, booked_miles, status')
          .gte('delivery_date', horizonIso),
        supabase
          .from('expenses')
          .select('expense_date, amount, expense_type')
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
          .select('purchase_date, gallons, total_cost')
          .gte('purchase_date', trailing90Iso),
      ]);

      const loads = loadsRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const payroll = payrollRes.data ?? [];
      const commissions = commissionsRes.data ?? [];
      const fuel = fuelRes.data ?? [];

      // Weekly buckets
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

      // Trailing 90-day miles for MPG
      const mpgCutoff = subDays(today, 90);
      let miles90 = 0;

      // Trailing 30-day dispatch stats
      const trailing30Cutoff = subDays(today, 30);
      const dispatchDaySet30 = new Set<string>();
      let miles30 = 0;

      // Month-to-date
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const dispatchDaysMonth = new Set<string>();
      let monthToDateRevenue = 0;

      for (const l of loads as any[]) {
        const d = safeDate(l.delivery_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        const rev = Number(l.gross_revenue) || 0;
        const miles = Number(l.actual_miles ?? l.booked_miles) || 0;
        if (idx >= 0) buckets[idx].revenue += rev;
        if (isAfter(d, mpgCutoff)) miles90 += miles;
        if (isAfter(d, trailing30Cutoff)) {
          miles30 += miles;
          dispatchDaySet30.add(l.delivery_date.slice(0, 10));
        }
        if (d >= monthStart && d <= monthEnd) {
          monthToDateRevenue += rev;
          dispatchDaysMonth.add(l.delivery_date.slice(0, 10));
        }
      }
      for (const c of commissions as any[]) {
        const d = safeDate(c.created_at);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx >= 0) buckets[idx].revenue += Number(c.commission_amount) || 0;
        if (d >= monthStart && d <= monthEnd) {
          monthToDateRevenue += Number(c.commission_amount) || 0;
        }
      }
      for (const e of expenses as any[]) {
        const d = safeDate(e.expense_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx >= 0) buckets[idx].costs += Number(e.amount) || 0;
      }
      for (const p of payroll as any[]) {
        const d = safeDate(p.period_end);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx >= 0) buckets[idx].costs += Number(p.net_pay) || 0;
      }

      for (const b of buckets) b.net = b.revenue - b.costs;

      const rollup = (days: number): PeriodRollup => {
        const cutoff = subDays(today, days);
        let revenue = 0, costs = 0, miles = 0;
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

      // === Runway inputs (all real data) ===

      // Fixed overhead: trailing 90-day recurring expenses grouped by type,
      // divided by 3 for monthly run-rate.
      const overheadByType = new Map<string, number>();
      for (const e of expenses as any[]) {
        const d = safeDate(e.expense_date);
        if (!d || !isAfter(d, subDays(today, 90))) continue;
        const type = String(e.expense_type || '').trim();
        if (!RECURRING_OVERHEAD_TYPES.has(type)) continue;
        overheadByType.set(type, (overheadByType.get(type) || 0) + (Number(e.amount) || 0));
      }
      const fixedBreakdown: FixedOverheadEntry[] = Array.from(overheadByType.entries())
        .map(([expenseType, sum]) => ({ expenseType, monthlyAmount: sum / 3 }))
        .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
      const fixedMonthly = fixedBreakdown.reduce((s, e) => s + e.monthlyAmount, 0);

      // Fuel: weighted avg price from actual fuel_purchases (trailing 90d)
      const gallons90 = fuel.reduce((s: number, f: any) => s + (Number(f.gallons) || 0), 0);
      const fuelSpend90 = fuel.reduce((s: number, f: any) => s + (Number(f.total_cost) || 0), 0);
      const fuelPricePerGallon = gallons90 > 0 ? fuelSpend90 / gallons90 : 0;
      const avgFleetMpg = gallons90 > 0 && miles90 > 0 ? miles90 / gallons90 : 0;

      // Dispatch cadence: distinct delivery days & miles in trailing 30d
      const plannedDispatchDays = dispatchDaySet30.size;
      const plannedMilesPerDay = plannedDispatchDays > 0 ? miles30 / plannedDispatchDays : 0;

      const projectedMonthlyMiles = plannedMilesPerDay * plannedDispatchDays;
      const projectedFuelMonthly =
        avgFleetMpg > 0 && fuelPricePerGallon > 0
          ? (projectedMonthlyMiles / avgFleetMpg) * fuelPricePerGallon
          : 0;

      const costPerDay =
        plannedDispatchDays > 0 ? (fixedMonthly + projectedFuelMonthly) / plannedDispatchDays : 0;

      const monthToDateDays = dispatchDaysMonth.size;
      const breakEvenMTD = costPerDay * monthToDateDays;

      return {
        week: rollup(7),
        month: rollup(30),
        quarter: rollup(90),
        weekly: buckets,
        runway: {
          fixedMonthly,
          fixedBreakdown,
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
