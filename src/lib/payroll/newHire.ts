import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { Payee } from '@/lib/tax/records';

const db = supabase as any;

/** Employers report each new hire to the state within 20 days of the hire date (federal rule; some states are shorter). */
export const NEW_HIRE_DAYS = 20;

export interface NewHireDue {
  payee: Payee;
  hireDate: string;
  deadline: string;
  /** Days left. Negative means it is late. */
  daysLeft: number;
  /** What the report needs that is not on file yet. */
  missing: string[];
}

/**
 * Pure: W-2 employees hired recently who have not been reported. The window looks back far enough that a late one is still
 * listed (and marked late) instead of disappearing.
 */
export function newHiresDue(payees: Payee[], reported: Set<string>, today: string, lookBackDays = 60): NewHireDue[] {
  const t = parseISO(today);
  return payees
    .filter((p) => p.employmentClass === 'w2' && p.active && p.hireDate && !reported.has(p.key))
    .map((p) => {
      const hire = parseISO(p.hireDate as string);
      const deadline = addDays(hire, NEW_HIRE_DAYS);
      const missing: string[] = [];
      if (!p.address) missing.push('home address');
      if (!p.ssnLast4) missing.push('Social Security number');
      if (!p.hasW4) missing.push('W-4');
      return { payee: p, hireDate: p.hireDate as string, deadline: format(deadline, 'yyyy-MM-dd'), daysLeft: differenceInCalendarDays(deadline, t), missing };
    })
    .filter((r) => differenceInCalendarDays(t, parseISO(r.hireDate)) >= 0 && differenceInCalendarDays(t, parseISO(r.hireDate)) <= lookBackDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export async function fetchReported(orgId: string): Promise<Set<string>> {
  const { data, error } = await db.from('new_hire_reports').select('payee_key').eq('org_id', orgId);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ payee_key: string }>).map((r) => r.payee_key));
}

export async function markReported(orgId: string, payeeKey: string, userId: string | null, reportedOn: string): Promise<void> {
  const { error } = await db.from('new_hire_reports').insert({ org_id: orgId, payee_key: payeeKey, reported_on: reportedOn, reported_by: userId });
  if (error && error.code !== '23505') throw new Error(error.message);
}
