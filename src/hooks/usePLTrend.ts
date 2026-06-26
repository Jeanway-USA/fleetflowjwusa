import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfWeek, addWeeks, subDays, isAfter } from 'date-fns';

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

export interface PLTrendData {
  week: PeriodRollup;
  month: PeriodRollup;
  quarter: PeriodRollup;
  weekly: WeekPoint[];
}

const WEEKS = 12;

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

      const [loadsRes, expensesRes, payrollRes, commissionsRes] = await Promise.all([
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
      ]);

      const loads = loadsRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const payroll = payrollRes.data ?? [];
      const commissions = commissionsRes.data ?? [];

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

      let totalMiles = 0;
      const milesByIdx: number[] = Array(WEEKS).fill(0);

      for (const l of loads as any[]) {
        const d = safeDate(l.delivery_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx < 0) continue;
        const rev = Number(l.gross_revenue) || 0;
        const miles = Number(l.actual_miles ?? l.booked_miles) || 0;
        buckets[idx].revenue += rev;
        milesByIdx[idx] += miles;
        totalMiles += miles;
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

      void totalMiles;
      return {
        week: rollup(7),
        month: rollup(30),
        quarter: rollup(90),
        weekly: buckets,
      };
    },
  });
}
