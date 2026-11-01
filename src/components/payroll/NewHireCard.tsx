import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { todayLocal } from '@/lib/datetime';
import { fetchReported, markReported, newHiresDue } from '@/lib/payroll/newHire';
import { loadPayees } from '@/lib/tax/records';
import { cn } from '@/lib/utils';

const KEY = ['payroll-new-hires'];

/** New hires that still have to be reported to the state, with the deadline. Hidden when there are none. */
export function NewHireCard({ orgId, userId }: { orgId: string | null; userId: string | null }) {
  const qc = useQueryClient();
  const { data: payees = [] } = useQuery({ queryKey: [...KEY, 'payees', orgId], queryFn: () => loadPayees(orgId as string), enabled: !!orgId });
  const { data: reported } = useQuery({ queryKey: [...KEY, 'reported', orgId], queryFn: () => fetchReported(orgId as string), enabled: !!orgId, retry: false });
  const due = useMemo(() => (reported ? newHiresDue(payees, reported, todayLocal()) : []), [payees, reported]);
  const done = useMutation({
    mutationFn: (key: string) => markReported(orgId as string, key, userId, todayLocal()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Marked as reported.'); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (due.length === 0) return null;
  return (
    <section className="mb-4 space-y-2 rounded-lg border bg-card p-3">
      <h2 className="text-sm font-semibold">New hires to report to the state</h2>
      <p className="text-xs text-muted-foreground">Each new employee must be reported within 20 days of the hire date, through your state's new hire reporting site. Mark it here once done.</p>
      <ul className="space-y-1.5">
        {due.map((r) => (
          <li key={r.payee.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5 text-sm">
            <span className="font-medium">{r.payee.firstName} {r.payee.lastName}</span>
            <span className="text-muted-foreground">hired {r.hireDate}</span>
            <span className={cn('text-xs', r.daysLeft < 0 ? 'font-medium text-destructive' : r.daysLeft <= 5 ? 'text-warning' : 'text-muted-foreground')}>
              {r.daysLeft < 0 ? `${-r.daysLeft} days late (was due ${r.deadline})` : r.daysLeft === 0 ? 'due today' : `due ${r.deadline} (${r.daysLeft} days)`}
            </span>
            {r.missing.length > 0 && <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" />Missing: {r.missing.join(', ')}</span>}
            <Button variant="outline" size="sm" className="ml-auto h-9" disabled={done.isPending} onClick={() => done.mutate(r.payee.key)}>Mark reported</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
