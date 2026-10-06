import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  format,
  parseISO,
  startOfWeek,
  addWeeks,
  subDays,
  addDays,
  isAfter,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { SETTLEMENT_WEEK_START } from '@/lib/settlement-week';
import { driverPayEvents, expenseCost, truckRevenueOf, MIRRORED_LOAN_EXPENSE_TYPE } from '@/lib/pl-metrics';

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

export interface ExpenseBreakdownEntry {
  expenseType: string;
  amount: number;
}

export interface RunwayMetrics {
  trailing30Expenses: number;
  trailing90Expenses: number;
  trailing30CostPerDay: number;
  monthToDateExpenses: number;
  monthToDateNet: number;
  expenseBreakdown: ExpenseBreakdownEntry[];
  plannedDispatchDays: number;
  activeTrucksMTD: number;
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

const safeDate = (d: string | null | undefined): Date | null => {
  if (!d) return null;
  try {
    return parseISO(`${d.slice(0, 10)}T00:00:00`);
  } catch {
    return null;
  }
};

const isOnOrAfter = (date: Date, cutoff: Date) => date.getTime() >= cutoff.getTime();

export function usePLTrend() {
  return useQuery<PLTrendData>({
    queryKey: ['pl-trend', WEEKS],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const today = new Date();
      const horizonStart = startOfWeek(subDays(today, 7 * (WEEKS - 1)), { weekStartsOn: SETTLEMENT_WEEK_START });
      const horizonIso = format(horizonStart, 'yyyy-MM-dd');
      const trailing90Cutoff = subDays(today, 90);
      const trailing90Iso = format(trailing90Cutoff, 'yyyy-MM-dd');

      const earliestIso = horizonIso < trailing90Iso ? horizonIso : trailing90Iso;
      const [loadsRes, expensesRes, payrollRes, commissionsRes, loanRes, settlementsRes] = await Promise.all([
        supabase
          .from('fleet_loads')
          .select('delivery_date, gross_revenue, truck_revenue, net_revenue, actual_miles, booked_miles, status, truck_id')
          .gte('delivery_date', horizonIso),
        supabase
          .from('expenses')
          .select('expense_date, amount, expense_type, notes')
          .gte('expense_date', trailing90Iso),
        supabase
          .from('driver_payroll')
          .select('driver_id, period_end, net_pay')
          .gte('period_end', horizonIso),
        supabase
          .from('agent_commissions')
          .select('created_at, commission_amount')
          .gte('created_at', horizonIso),
        (supabase as any)
          .from('truck_loan_payments')
          .select('payment_date, amount')
          .gte('payment_date', earliestIso),
        supabase
          .from('driver_settlements')
          .select('driver_id, period_end, status, gross_pay, reimbursements')
          .is('deleted_at', null)
          .gte('period_end', earliestIso),
      ]);

      const loads = loadsRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const payroll = payrollRes.data ?? [];
      // Driver pay: approved or paid settlements (gross plus reimbursements) and payroll batches, never the same week twice.
      const driverPay = driverPayEvents((settlementsRes.data ?? []) as any[], payroll as any[]);
      const commissions = commissionsRes.data ?? [];
      const loanPayments = (loanRes.data ?? []) as Array<{ payment_date: string; amount: number | string }>;
      // Loan payments come from the ledger; skip any mirrored expense rows so a payment never counts twice.
      const costRows = (expenses as any[]).filter((e) => e.expense_type !== MIRRORED_LOAN_EXPENSE_TYPE);

      // Weekly buckets
      const buckets: WeekPoint[] = Array.from({ length: WEEKS }, (_, i) => {
        const start = addWeeks(horizonStart, i);
        return {
          weekStart: format(start, 'yyyy-MM-dd'),
          label: format(addDays(start, 6), 'MMM d'),
          revenue: 0,
          costs: 0,
          net: 0,
        };
      });

      const bucketIndex = (d: Date): number => {
        const weekStart = startOfWeek(d, { weekStartsOn: SETTLEMENT_WEEK_START });
        const diffDays = Math.floor((weekStart.getTime() - horizonStart.getTime()) / 86_400_000);
        const idx = Math.floor(diffDays / 7);
        return idx >= 0 && idx < WEEKS ? idx : -1;
      };

      // Trailing 30-day dispatch stats
      const trailing30Cutoff = subDays(today, 30);
      const dispatchDaySet30 = new Set<string>();

      // Month-to-date
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const dispatchDaysMonth = new Set<string>();
      const activeTrucksMonth = new Set<string>();
      let monthToDateRevenue = 0;

      for (const l of loads as any[]) {
        const d = safeDate(l.delivery_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        const rev = truckRevenueOf(l);
        const miles = Number(l.actual_miles ?? l.booked_miles) || 0;
        if (idx >= 0) buckets[idx].revenue += rev;
        if (isOnOrAfter(d, trailing30Cutoff)) {
          dispatchDaySet30.add(l.delivery_date.slice(0, 10));
        }
        if (d >= monthStart && d <= monthEnd) {
          monthToDateRevenue += truckRevenueOf(l);
          dispatchDaysMonth.add(l.delivery_date.slice(0, 10));
          if (l.truck_id) activeTrucksMonth.add(l.truck_id);
        }
      }
      for (const c of commissions as any[]) {
        const d = safeDate(c.created_at);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx >= 0) buckets[idx].revenue += Number(c.commission_amount) || 0;
      }
      for (const e of costRows) {
        const d = safeDate(e.expense_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx >= 0) buckets[idx].costs += expenseCost(e);
      }
      for (const lp of loanPayments) {
        const d = safeDate(lp.payment_date);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx >= 0) buckets[idx].costs += Number(lp.amount) || 0;
      }
      for (const pay of driverPay) {
        const d = safeDate(pay.date);
        if (!d) continue;
        const idx = bucketIndex(d);
        if (idx >= 0) buckets[idx].costs += pay.amount;
      }

      for (const b of buckets) b.net = b.revenue - b.costs;

      const rollup = (days: number): PeriodRollup => {
        const cutoff = subDays(today, days);
        let revenue = 0, costs = 0, miles = 0;
        for (const l of loads as any[]) {
          const d = safeDate(l.delivery_date);
          if (d && isAfter(d, cutoff)) {
            revenue += truckRevenueOf(l);
            miles += Number(l.actual_miles ?? l.booked_miles) || 0;
          }
        }
        for (const c of commissions as any[]) {
          const d = safeDate(c.created_at);
          if (d && isAfter(d, cutoff)) revenue += Number(c.commission_amount) || 0;
        }
        for (const e of costRows) {
          const d = safeDate(e.expense_date);
          if (d && isAfter(d, cutoff)) costs += expenseCost(e);
        }
        for (const lp of loanPayments) {
          const d = safeDate(lp.payment_date);
          if (d && isAfter(d, cutoff)) costs += Number(lp.amount) || 0;
        }
        for (const pay of driverPay) {
          const d = safeDate(pay.date);
          if (d && isAfter(d, cutoff)) costs += pay.amount;
        }
        return { revenue, costs, miles };
      };

      // === Runway inputs (all real recorded P&L data) ===

      const expensesByType = new Map<string, number>();
      let trailing30Expenses = 0;
      let trailing90Expenses = 0;
      let monthToDateExpenses = 0;

      const addRunwayCost = (d: Date, type: string, amount: number) => {
        if (isOnOrAfter(d, trailing30Cutoff)) {
          trailing30Expenses += amount;
          expensesByType.set(type, (expensesByType.get(type) || 0) + amount);
        }
        if (isOnOrAfter(d, trailing90Cutoff)) trailing90Expenses += amount;
        if (d >= monthStart && d <= monthEnd) monthToDateExpenses += amount;
      };
      for (const lp of loanPayments) {
        const d = safeDate(lp.payment_date);
        if (d) addRunwayCost(d, 'Truck loan', Number(lp.amount) || 0);
      }
      for (const pay of driverPay) {
        const d = safeDate(pay.date);
        if (d) addRunwayCost(d, 'Driver pay', pay.amount);
      }
      for (const e of costRows) {
        const d = safeDate(e.expense_date);
        if (!d) continue;
        const amount = expenseCost(e);
        if (amount === 0) continue;
        addRunwayCost(d, String(e.expense_type || '').trim(), amount);
      }

      // Dispatch cadence: distinct delivery days & miles in trailing 30d
      const plannedDispatchDays = dispatchDaySet30.size;

      const costPerDay = trailing30Expenses / 30;

      const monthToDateDays = dispatchDaysMonth.size;
      const breakEvenMTD = monthToDateExpenses;
      const monthToDateNet = monthToDateRevenue - monthToDateExpenses;
      const expenseBreakdown: ExpenseBreakdownEntry[] = Array.from(expensesByType.entries())
        .map(([expenseType, amount]) => ({ expenseType, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

      return {
        week: rollup(7),
        month: rollup(30),
        quarter: rollup(90),
        weekly: buckets,
        runway: {
          trailing30Expenses,
          trailing90Expenses,
          trailing30CostPerDay: costPerDay,
          monthToDateExpenses,
          monthToDateNet,
          expenseBreakdown,
          plannedDispatchDays,
          activeTrucksMTD: activeTrucksMonth.size,
          costPerDay,
          monthToDateRevenue,
          monthToDateDays,
          breakEvenMTD,
        },
      };
    },
  });
}
