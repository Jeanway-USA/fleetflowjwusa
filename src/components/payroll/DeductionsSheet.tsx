import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { supabase } from '@/integrations/supabase/client';
import { todayLocal } from '@/lib/datetime';
import { formatCurrency } from '@/lib/formatters';
import { annualLimitFor, KINDS, type DeductionKind } from '@/lib/payroll/deductions';
import { loadLedger, planFromRow, type PlanRecord } from '@/lib/payroll/deductionPlans';
import { loadPayees, type Payee } from '@/lib/tax/records';

const db = supabase as any;
const KEY = ['payroll-deduction-plans'];
const GROUPS: Array<{ group: string; title: string }> = [
  { group: 'benefit', title: 'Insurance and savings accounts (before tax)' },
  { group: 'retirement', title: '401(k)' },
  { group: 'garnishment', title: 'Garnishments and levies' },
  { group: 'after_tax', title: 'Advances, loans, escrow and other (after tax)' },
];
const CATCH_UP_LABEL: Record<string, string> = { none: 'None', age_50: 'Age 50 or older', age_60_63: 'Age 60 to 63', age_55_hsa: 'Age 55 or older (HSA)' };

interface Form {
  kind: DeductionKind;
  label: string;
  method: 'flat' | 'percent';
  amount: string;
  employerAmount: string;
  startDate: string;
  endDate: string;
  totalToCollect: string;
  catchUp: string;
  familyCoverage: boolean;
  supportingFamily: boolean;
  arrearsOver12Weeks: boolean;
  levyExempt: string;
  caseReference: string;
  payTo: string;
  note: string;
}

const blank = (): Form => ({ kind: 'health_insurance', label: KINDS.health_insurance.label, method: 'flat', amount: '', employerAmount: '', startDate: todayLocal(), endDate: '', totalToCollect: '', catchUp: 'none', familyCoverage: false, supportingFamily: false, arrearsOver12Weeks: false, levyExempt: '', caseReference: '', payTo: '', note: '' });

const num = (s: string) => (s.trim() === '' ? null : Number(s));

/** Standing deductions for one person at a time: insurance, 401(k), garnishments, loans. The pay run takes them automatically. */
export function DeductionsSheet({ open, onOpenChange, orgId, userId }: { open: boolean; onOpenChange: (v: boolean) => void; orgId: string | null; userId: string | null }) {
  const qc = useQueryClient();
  const [personKey, setPersonKey] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);

  const { data: payees = [] } = useQuery({ queryKey: ['payroll-deduction-payees', orgId], queryFn: () => loadPayees(orgId as string), enabled: open && !!orgId });
  const people = useMemo(() => payees.filter((p) => p.employmentClass === 'w2').sort((a, b) => Number(b.active) - Number(a.active) || `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)), [payees]);
  const person: Payee | undefined = people.find((p) => p.key === personKey);

  const { data: plans = [], isLoading, error } = useQuery({
    queryKey: [...KEY, orgId, person?.key],
    enabled: open && !!orgId && !!person,
    queryFn: async (): Promise<PlanRecord[]> => {
      const { data, error: e } = await db.from('payroll_deduction_plans').select('*').eq('org_id', orgId).eq('payee_type', person!.type).eq('payee_id', person!.id).is('archived_at', null).order('created_at');
      if (e) throw e;
      const rows = (data ?? []) as any[];
      const ledger = await loadLedger(rows.map((r) => r.id), new Date().getFullYear());
      return rows.map((r) => planFromRow(r, ledger.get(r.id)?.collected ?? 0, ledger.get(r.id)?.ytd ?? 0));
    },
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing || !person || !orgId) return;
      const f = editing.form;
      const amount = Number(f.amount);
      if (!(amount >= 0) || f.amount.trim() === '') throw new Error('Enter the amount to take each pay.');
      if (f.method === 'percent' && amount > 100) throw new Error('A percent cannot be more than 100.');
      if (!f.startDate) throw new Error('Choose the date it starts.');
      if (f.endDate && f.endDate < f.startDate) throw new Error('The end date is before the start date.');
      const info = KINDS[f.kind];
      const row = {
        org_id: orgId,
        payee_type: person.type,
        payee_id: person.id,
        kind: f.kind,
        label: f.label.trim() || info.label,
        method: f.method,
        amount,
        employer_amount: info.group === 'benefit' || info.group === 'retirement' ? num(f.employerAmount) ?? 0 : 0,
        start_date: f.startDate,
        end_date: f.endDate || null,
        total_to_collect: info.group === 'benefit' || info.group === 'retirement' ? null : num(f.totalToCollect),
        catch_up: f.catchUp === 'none' ? null : f.catchUp,
        family_coverage: f.familyCoverage,
        supporting_family: f.supportingFamily,
        arrears_over_12_weeks: f.arrearsOver12Weeks,
        levy_exempt_per_period: f.kind === 'tax_levy' ? num(f.levyExempt) : null,
        case_reference: f.caseReference.trim() || null,
        pay_to: f.payTo.trim() || null,
        note: f.note.trim() || null,
      };
      const { error: e } = editing.id ? await db.from('payroll_deduction_plans').update(row).eq('id', editing.id) : await db.from('payroll_deduction_plans').insert({ ...row, created_by: userId });
      if (e) throw e;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); setEditing(null); toast.success('Deduction saved. It is taken the next time this person\'s pay is made.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await db.from('payroll_deduction_plans').update({ archived_at: new Date().toISOString() }).eq('id', id);
      if (e) throw e;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Deduction stopped. What was already taken stays on record.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setForm = (patch: Partial<Form>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const openEdit = (p: PlanRecord) => setEditing({
    id: p.id,
    form: { kind: p.kind, label: p.label, method: p.method, amount: String(p.amount), employerAmount: p.employerAmount ? String(p.employerAmount) : '', startDate: p.startDate, endDate: p.endDate ?? '', totalToCollect: p.totalToCollect == null ? '' : String(p.totalToCollect), catchUp: p.catchUp ?? 'none', familyCoverage: !!p.familyCoverage, supportingFamily: !!p.supportingFamily, arrearsOver12Weeks: !!p.arrearsOver12Weeks, levyExempt: p.levyExemptPerPeriod == null ? '' : String(p.levyExemptPerPeriod), caseReference: p.caseReference ?? '', payTo: p.payTo ?? '', note: p.note ?? '' },
  });

  const f = editing?.form;
  const info = f ? KINDS[f.kind] : null;
  const limit = f && info ? annualLimitFor({ kind: f.kind, catchUp: f.catchUp as never, familyCoverage: f.familyCoverage, annualLimitOverride: null }) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Deductions and benefits</SheetTitle>
            <SheetDescription>Standing deductions for one person: insurance, 401(k), garnishments, loans. Each pay run takes them automatically and follows the tax rules for each kind.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Person</Label>
              <Select value={personKey} onValueChange={setPersonKey}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                <SelectContent>{people.map((p) => <SelectItem key={p.key} value={p.key}>{p.firstName} {p.lastName} · {p.type === 'driver' ? 'Driver' : 'Staff'}{p.active ? '' : ' (inactive)'}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {!person ? null : error ? (
              <EmptyState icon={Plus} title="Deductions are not switched on yet" description="The database update for deductions has not been applied yet." />
            ) : isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {plans.length === 0 ? <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No deductions for {person.firstName}.</p> : (
                  <ul className="space-y-2">
                    {plans.map((p) => {
                      const lim = annualLimitFor(p);
                      const ended = !!p.endDate && p.endDate < todayLocal();
                      return (
                        <li key={p.id} className="rounded-lg border bg-card p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{p.label}</p>
                            <Badge variant="outline" className="rounded-sm text-xs font-normal">{KINDS[p.kind].group === 'garnishment' ? 'Legal order' : KINDS[p.kind].lowers.fit ? 'Before tax' : 'After tax'}</Badge>
                            {ended && <Badge variant="outline" className="rounded-sm text-xs font-normal">Ended</Badge>}
                            <span className="ml-auto tabular-nums">{p.method === 'percent' ? `${p.amount}%` : formatCurrency(p.amount)} <span className="text-xs text-muted-foreground">each pay</span></span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            From {p.startDate}{p.endDate ? ` to ${p.endDate}` : ''}
                            {p.totalToCollect != null ? ` · ${formatCurrency(p.collected)} of ${formatCurrency(p.totalToCollect)} collected` : p.collected > 0 ? ` · ${formatCurrency(p.collected)} taken so far` : ''}
                            {lim != null ? ` · ${formatCurrency(p.ytdThisYear)} of ${formatCurrency(lim)} yearly limit` : ''}
                            {p.employerAmount ? ` · Company adds ${formatCurrency(p.employerAmount)}` : ''}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" className="h-9" onClick={() => openEdit(p)}>Change</Button>
                            <Button size="sm" variant="outline" className="h-9" disabled={archive.isPending} onClick={() => archive.mutate(p.id)}>Stop</Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Button className="h-12 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setEditing({ id: null, form: blank() })}><Plus className="h-4 w-4" />Add a deduction</Button>
                <p className="text-xs text-muted-foreground">A new or changed deduction applies the next time pay is made. A draft that already exists is not changed until it is made again.</p>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Change deduction' : 'Add a deduction'}</DialogTitle>
            <DialogDescription>{person ? `For ${person.firstName} ${person.lastName}.` : ''}</DialogDescription>
          </DialogHeader>
          {f && info && (
            <div className="space-y-3">
              <div>
                <Label>Kind</Label>
                <Select value={f.kind} onValueChange={(v) => { const k = v as DeductionKind; setForm({ kind: k, label: KINDS[k].label }); }} disabled={!!editing?.id}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GROUPS.map((g) => (
                      <div key={g.group}>
                        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{g.title}</p>
                        {(Object.keys(KINDS) as DeductionKind[]).filter((k) => KINDS[k].group === g.group).map((k) => <SelectItem key={k} value={k}>{KINDS[k].label}</SelectItem>)}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Name on the pay stub</Label><Input className="h-12" value={f.label} onChange={(e) => setForm({ label: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Taken as</Label>
                  <Select value={f.method} onValueChange={(v) => setForm({ method: v as 'flat' | 'percent' })}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="flat">Dollars each pay</SelectItem><SelectItem value="percent">Percent of pay</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>{f.method === 'percent' ? 'Percent' : 'Amount'}</Label><Input className="h-12" inputMode="decimal" value={f.amount} onChange={(e) => setForm({ amount: e.target.value })} /></div>
              </div>
              {(info.group === 'benefit' || info.group === 'retirement') && (
                <div><Label>Company adds each pay (optional)</Label><Input className="h-12" inputMode="decimal" value={f.employerAmount} onChange={(e) => setForm({ employerAmount: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">A match or the company's share of the premium. It is reported on the W-2 and in company cost, not taken from pay.</p></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Starts</Label><Input className="h-12" type="date" value={f.startDate} onChange={(e) => setForm({ startDate: e.target.value })} /></div>
                <div><Label>Ends (optional)</Label><Input className="h-12" type="date" value={f.endDate} onChange={(e) => setForm({ endDate: e.target.value })} /></div>
              </div>
              {info.group !== 'benefit' && info.group !== 'retirement' && (
                <div><Label>Stop after this total (optional)</Label><Input className="h-12" inputMode="decimal" value={f.totalToCollect} onChange={(e) => setForm({ totalToCollect: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">The balance owed. The deduction stops by itself once it is paid off.</p></div>
              )}
              {(f.kind === 'retirement_pretax' || f.kind === 'retirement_roth' || f.kind === 'hsa') && (
                <div>
                  <Label>Catch-up room</Label>
                  <Select value={f.catchUp} onValueChange={(v) => setForm({ catchUp: v })}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>{(f.kind === 'hsa' ? ['none', 'age_55_hsa'] : ['none', 'age_50', 'age_60_63']).map((c) => <SelectItem key={c} value={c}>{CATCH_UP_LABEL[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {f.kind === 'hsa' && (
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.familyCoverage} onCheckedChange={(v) => setForm({ familyCoverage: v === true })} />Family coverage (higher yearly limit)</label>
              )}
              {limit != null && <p className="text-xs text-muted-foreground">Yearly limit for 2026: {formatCurrency(limit)}. Deductions stop when it is reached.</p>}
              {f.kind === 'garnish_child_support' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.supportingFamily} onCheckedChange={(v) => setForm({ supportingFamily: v === true })} />Also supports another spouse or child (limit 50% instead of 60%)</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.arrearsOver12Weeks} onCheckedChange={(v) => setForm({ arrearsOver12Weeks: v === true })} />Support is more than 12 weeks behind (adds 5%)</label>
                </div>
              )}
              {f.kind === 'tax_levy' && (
                <div><Label>Exempt from the levy each pay</Label><Input className="h-12" inputMode="decimal" value={f.levyExempt} onChange={(e) => setForm({ levyExempt: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">From the levy notice (Form 668-W). Everything above this amount can be taken.</p></div>
              )}
              {info.group === 'garnishment' && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Case or order number</Label><Input className="h-12" value={f.caseReference} onChange={(e) => setForm({ caseReference: e.target.value })} /></div>
                  <div><Label>Pay to</Label><Input className="h-12" value={f.payTo} onChange={(e) => setForm({ payTo: e.target.value })} /></div>
                </div>
              )}
              <div><Label>Note (optional)</Label><Input className="h-12" value={f.note} onChange={(e) => setForm({ note: e.target.value })} /></div>
              {info.group === 'garnishment' && <p className="text-xs text-muted-foreground">Limits shown follow federal rules. State law can be lower, and the order itself always wins.</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-12" onClick={() => setEditing(null)} disabled={save.isPending}>Cancel</Button>
            <LoadingButton className="h-12 bg-primary text-primary-foreground hover:bg-primary/90" loading={save.isPending} onClick={() => save.mutate()}>Save</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
