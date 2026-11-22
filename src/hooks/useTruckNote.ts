import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { truckNoteForPeriod, type TruckNote } from '@/lib/truck-note';

const NONE: TruckNote = { amount: 0, source: 'none', units: 0, weeks: 0, rule: '' };

/**
 * The truck note for a period (both dates YYYY-MM-DD), by the one rule in lib/truck-note: monthly payment x 12 / 52 a week
 * for each unit that still owes, unless Truck Payment expenses are already recorded in the period. Reads the trucks and
 * those expenses; fails soft to "no note" so the money views never break over it.
 */
export function useTruckNote(startIso: string, endIso: string): TruckNote {
  const { data } = useQuery({
    queryKey: ['truck-note', startIso, endIso],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [trucks, expenses] = await Promise.all([
        supabase.from('trucks').select('unit_number, status, deleted_at, monthly_payment, loan_balance, loan_start_date').is('deleted_at', null),
        supabase.from('expenses').select('expense_type, amount, expense_date').eq('expense_type', 'Truck Payment').is('deleted_at', null).gte('expense_date', startIso).lte('expense_date', endIso),
      ]);
      if (trucks.error) throw trucks.error;
      return truckNoteForPeriod(trucks.data ?? [], startIso, endIso, expenses.error ? [] : (expenses.data ?? []));
    },
  });
  return data ?? NONE;
}
