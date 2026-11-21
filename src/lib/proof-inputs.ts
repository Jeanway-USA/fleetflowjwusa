import { supabase } from '@/integrations/supabase/client';
import type { ProofExpense, ProofLoad } from '@/lib/weekly-proof';

/**
 * Your loads and the expenses tied to them, read fresh, in the shape the weekly proof compares against Landstar's lines.
 * Expenses include advance-only trips (tagged "Landstar trip ... (advance only)") so those are provable too.
 */
export async function fetchProofInputs(): Promise<{ loads: ProofLoad[]; expenses: ProofExpense[] }> {
  const [{ data: loads, error: loadsError }, { data: expenses, error: expensesError }] = await Promise.all([
    supabase.from('fleet_loads').select('id, landstar_load_id, net_revenue').is('deleted_at', null),
    supabase
      .from('expenses')
      .select('id, expense_date, load_id, expense_type, amount, description, notes')
      .is('deleted_at', null)
      .or('load_id.not.is.null,notes.ilike.Landstar trip%')
      .limit(10000),
  ]);
  if (loadsError) throw loadsError;
  if (expensesError) throw expensesError;
  return { loads: (loads ?? []) as ProofLoad[], expenses: (expenses ?? []) as ProofExpense[] };
}
