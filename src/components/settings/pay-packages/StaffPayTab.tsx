import { todayLocal } from '@/lib/datetime';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addDays, format, parseISO } from 'date-fns';
import { Archive, Check, ChevronDown, Download, Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared/FormParts';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { downloadCsv } from '@/components/fleet/Roster';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isMissingTables } from '@/hooks/usePayPackages';
import { loadPackageContext } from '@/lib/pay-packages/generate';
import {
  fetchStaffNames,
  fetchStaffStatements,
  generateStaffStatements,
  setStatementStatus,
  staffOnPackages,
  type StaffStatement,
} from '@/lib/pay-packages/staff';
import { formatCurrency, formatDate } from '@/lib/formatters';

const KEY = ['staff-pay-statements'] as const;
const today = todayLocal;

/**
 * Pay statements for staff (people who are not drivers) from their pay package. Owners and payroll admins make,
 * approve and mark them paid; everyone else sees only their own. Pay is shown before taxes.
 */
export function StaffPayTab() {
  const { hasPayrollAccess, orgId, user } = useAuth();
  const qc = useQueryClient();
  const [periodEnd, setPeriodEnd] = useState(today());
  const [open, setOpen] = useState<string | null>(null);
  const periodStart = useMemo(() => format(addDays(parseISO(periodEnd || today()), -6), 'yyyy-MM-dd'), [periodEnd]);

  const { data: statements = [], error, isLoading } = useQuery({ queryKey: KEY, queryFn: fetchStaffStatements, retry: false });
  const { data: names = new Map<string, string>() } = useQuery({
    queryKey: [...KEY, 'names', statements.map((s) => s.user_id).join(',')],
    queryFn: () => fetchStaffNames(Array.from(new Set(statements.map((s) => s.user_id)))),
    enabled: statements.length > 0,
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Your organization has not finished loading.');
      if (!periodEnd) throw new Error('Choose the last day of the pay period.');
      const context = await loadPackageContext();
      // Anyone with a driver record is paid through settlements. Never pay them here as well.
      const { data: driverUsers } = await supabase.from('drivers').select('user_id').not('user_id', 'is', null);
      const driverUserIds = new Set((driverUsers ?? []).map((d) => d.user_id as string));
      const staffIds = staffOnPackages(context, periodEnd).filter((id) => !driverUserIds.has(id));
      if (staffIds.length === 0) throw new Error('No staff have a pay package yet. Assign one from Team, Position & pay.');
      return generateStaffStatements({ orgId, userId: user?.id ?? null, staffIds, periodStart, periodEnd, context });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY });
      const note = r.skipped.length > 0 ? ` ${r.skipped.length} skipped: ${r.skipped[0].reason}.` : '';
      toast[r.created > 0 ? 'success' : 'info'](r.created > 0 ? `Made ${r.created} pay statement${r.created === 1 ? '' : 's'}.${note}` : `No statements made.${note}`);
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not make the statements'),
  });

  const act = useMutation({
    mutationFn: (a: { id: string; action: 'approve' | 'pay' | 'archive' | 'restore' }) => setStatementStatus(a.id, a.action),
    onSuccess: (_d, a) => {
      qc.invalidateQueries({ queryKey: KEY });
      if (a.action === 'archive') toast.success('Statement archived.', { action: { label: 'Undo', onClick: () => act.mutate({ id: a.id, action: 'restore' }) } });
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not update the statement'),
  });

  const exportCsv = () =>
    downloadCsv(
      `staff-pay-${today()}`,
      ['Person', 'Period start', 'Period end', 'Package', 'Taxable pay', 'Not taxable', 'Deductions', 'Pay before taxes', 'Status'],
      statements.map((s) => [names.get(s.user_id) ?? s.user_id, s.period_start, s.period_end, s.package_name, s.gross_pay, s.non_taxable, s.deductions, s.net_pay, s.status]),
    );

  if (error) {
    return (
      <Card className="bg-card border border-border rounded-lg">
        <CardContent className="py-10 text-center">
          <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{isMissingTables(error) ? 'Staff pay is not switched on yet' : 'Staff pay could not load'}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {isMissingTables(error) ? 'The database update for staff pay has not been applied yet.' : (error as Error).message}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border border-border rounded-lg">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" />{hasPayrollAccess ? 'Staff pay' : 'My pay statements'}</CardTitle>
          <CardDescription>
            {hasPayrollAccess
              ? 'Pay statements for staff, worked out from their pay package. Shown before taxes. Drivers are paid through settlements.'
              : 'Your pay statements. Shown before taxes.'}
          </CardDescription>
        </div>
        {statements.length > 0 && (
          <Button variant="outline" className="min-h-[44px]" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Export</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPayrollAccess && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
            <Field label="Pay period ends" className="w-44">
              <Input type="date" className="h-11" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
            <p className="pb-3 text-xs text-muted-foreground">Covers {formatDate(periodStart)} to {periodEnd ? formatDate(periodEnd) : '…'}</p>
            <LoadingButton loading={generate.isPending} disabled={generate.isPending} onClick={() => generate.mutate()} className="min-h-[44px] bg-primary text-primary-foreground hover:bg-primary/90">
              Make statements
            </LoadingButton>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && statements.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No pay statements yet.</div>
        )}

        <ul className="space-y-2">
          {statements.map((s: StaffStatement) => (
            <li key={s.id} className="rounded-lg border">
              <div className="flex flex-wrap items-center gap-3 p-3">
                <button type="button" className="flex min-h-[44px] min-w-0 flex-1 basis-56 items-center gap-2 text-left" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === s.id ? 'rotate-180' : ''}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{hasPayrollAccess ? names.get(s.user_id) ?? 'Staff' : s.package_name ?? 'Pay statement'}</span>
                    <span className="block text-xs text-muted-foreground">{formatDate(s.period_start)} to {formatDate(s.period_end)}{s.package_name && hasPayrollAccess ? ` · ${s.package_name}` : ''}</span>
                  </span>
                </button>
                <span className="tabular-nums font-semibold">{formatCurrency(s.net_pay)}</span>
                <Badge variant={s.status === 'paid' ? 'default' : 'outline'} className="capitalize">{s.status}</Badge>
                {hasPayrollAccess && (
                  <div className="flex gap-1">
                    {s.status === 'draft' && <Button variant="outline" className="min-h-[44px]" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'approve' })}><Check className="mr-1.5 h-4 w-4" />Approve</Button>}
                    {s.status === 'approved' && <Button variant="outline" className="min-h-[44px]" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'pay' })}>Mark paid</Button>}
                    {s.status !== 'paid' && <Button variant="ghost" className="min-h-[44px]" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'archive' })}><Archive className="mr-1.5 h-4 w-4" />Archive</Button>}
                  </div>
                )}
              </div>
              {open === s.id && (
                <ul className="divide-y border-t px-3 text-sm">
                  {s.lines.map((l, i) => (
                    <li key={`${l.componentId}-${i}`} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0"><span className="block">{l.label}</span><span className="block text-xs text-muted-foreground">{l.detail}</span></span>
                      <span className="tabular-nums">{l.isDeduction ? '−' : ''}{formatCurrency(l.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between py-2 font-semibold"><span>Pay before taxes</span><span className="tabular-nums">{formatCurrency(s.net_pay)}</span></li>
                </ul>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
