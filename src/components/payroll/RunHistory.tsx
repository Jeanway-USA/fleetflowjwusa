import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { PayRun } from '@/lib/payroll/payRun';

const db = supabase as any;
const when = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'MMM d, yyyy h:mm a') : '');

/** Who made, approved, paid or voided a run, and when. Read from the run itself, so it cannot be edited after the fact. */
export function RunHistory({ run }: { run: PayRun }) {
  const ids = [run.created_by, run.approved_by, run.paid_by, run.voided_by].filter(Boolean) as string[];
  const { data: names } = useQuery({
    queryKey: ['payroll-run-history-names', ...ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await db.from('profiles').select('user_id, first_name, last_name, email').in('user_id', Array.from(new Set(ids)));
      return new Map<string, string>(((data ?? []) as any[]).map((p) => [p.user_id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Someone']));
    },
  });
  const who = (id?: string | null) => (id ? names?.get(id) ?? 'someone' : 'someone');
  const steps = [
    { label: 'Started', at: run.created_at, by: run.created_by },
    run.approved_at && { label: 'Approved and locked', at: run.approved_at, by: run.approved_by },
    run.paid_at && { label: 'Marked paid', at: run.paid_at, by: run.paid_by },
    run.voided_at && { label: 'Voided', at: run.voided_at, by: run.voided_by },
  ].filter(Boolean) as Array<{ label: string; at: string; by?: string | null }>;
  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">History</h3>
      <ol className="space-y-0.5 text-sm">
        {steps.map((s) => <li key={s.label} className="flex flex-wrap gap-x-2"><span className="font-medium">{s.label}</span><span className="text-muted-foreground">by {who(s.by)} on {when(s.at)}</span></li>)}
      </ol>
    </section>
  );
}
