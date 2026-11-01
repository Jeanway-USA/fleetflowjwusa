import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileText, Landmark, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { toCsv } from '@/lib/csv';
import { formatCurrency } from '@/lib/formatters';
import { generateChecksPdf } from '@/lib/pdf/generateChecksPdf';
import type { EmployerBlock } from '@/lib/pdf/generateW2Pdf';
import { routingValid } from '@/lib/payroll/ach';
import type { PayRun, PayRunItem } from '@/lib/payroll/payRun';
import {
  assignCheckNumbers, buildRunDeposit, changeMethod, createPayments, fetchBankStatus, fetchPayments, loadPaymentSettings, markReturned, markSent,
  METHOD_LABEL, paymentListRows, PAYMENT_STATUS_LABEL, savePaymentSettings, type Payment, type PaymentSettings, type PayMethod,
} from '@/lib/payroll/payments';
import { cn } from '@/lib/utils';

const KEY = ['payroll-payments'];
const saveFile = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const STATUS_CLASS: Record<string, string> = { pending: 'text-warning border-warning/40', sent: 'text-success border-success/40', returned: 'text-destructive border-destructive/40', void: 'text-muted-foreground' };

/** After a run is approved: how each person is paid, the deposit file for the bank, checks to print, and what has been sent. */
export function PaymentsSection({ run, items, orgId, userId, employer }: { run: PayRun; items: PayRunItem[]; orgId: string | null; userId: string | null; employer: EmployerBlock }) {
  const qc = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [effective, setEffective] = useState(run.pay_date);
  const [returning, setReturning] = useState<Payment | null>(null);
  const [why, setWhy] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [letter, setLetter] = useState('A');

  const { data: payments = [], error } = useQuery({ queryKey: [...KEY, run.id], queryFn: () => fetchPayments(run.id), retry: false });
  const { data: bank } = useQuery({ queryKey: [...KEY, run.id, 'bank'], queryFn: () => fetchBankStatus(run.id), retry: false, enabled: !error });
  const { data: settings } = useQuery({ queryKey: [...KEY, 'settings', orgId], queryFn: () => loadPaymentSettings(orgId as string), enabled: !!orgId && !error });
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const setup = useMutation({ mutationFn: () => { if (!orgId) throw new Error('Not signed in to an organization.'); return createPayments(run, items, userId, orgId); }, onSuccess: (n) => { toast.success(n > 0 ? `Payments set up for ${n} people.` : 'Payments were already set up.'); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const change = useMutation({ mutationFn: ({ p, method }: { p: Payment; method: PayMethod }) => changeMethod(p, method, bank?.get(p.item_id)?.account_last4 ?? null), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const returned = useMutation({ mutationFn: () => markReturned(returning!.id, why), onSuccess: () => { toast.success('Marked returned. Change how they are paid and send it again.'); setReturning(null); setWhy(''); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  const deposits = payments.filter((p) => p.method === 'direct_deposit');
  const checks = payments.filter((p) => p.method === 'check');
  const pendingDeposits = deposits.filter((p) => p.status === 'pending' && p.amount > 0);
  const pendingChecks = checks.filter((p) => p.status === 'pending' && p.amount > 0);
  const total = (list: Payment[]) => list.reduce((s, p) => s + p.amount, 0);
  const itemOf = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  if (error) {
    return (
      <section className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Payments are not switched on yet</p>
        <p className="text-muted-foreground">The database update for payments has not been applied yet.</p>
      </section>
    );
  }

  const downloadDeposit = async () => {
    if (!settings) return;
    setBusy('deposit');
    setProblems([]);
    try {
      const built = await buildRunDeposit(run, { ...settings, originId: employer.ein ?? undefined }, payments, effective, letter);
      if (built.problems.length > 0) { setProblems(built.problems); return; }
      saveFile(new Blob([built.file.text], { type: 'text/plain' }), `direct_deposit_${run.pay_date}_${letter}.txt`);
      toast.success(`Deposit file made for ${built.file.entryCount} people, ${formatCurrency(built.file.totalCents / 100)}. Upload it at your bank (in Truist: Treasury Manager, File Services, ACH standard), have a second person approve it there, then mark them sent here.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const printChecks = async () => {
    if (!orgId) return;
    setBusy('checks');
    try {
      const numbered = await assignCheckNumbers(orgId, pendingChecks);
      const pdf = generateChecksPdf(numbered.map((p) => {
        const i = itemOf.get(p.item_id);
        return { number: p.check_number as number, payee: p.payee_name, amount: p.amount, date: run.pay_date, memo: `Pay ${run.pay_date}`, stubLines: i ? [['Gross pay', formatCurrency(i.gross)], ['Reimbursed', formatCurrency(i.non_taxable)], ['Taxes withheld', formatCurrency(i.taxes)], ['Deductions', formatCurrency(i.deductions)], ['Take-home', formatCurrency(i.net)]] : [] };
      }), employer);
      saveFile(pdf, `checks_${run.pay_date}.pdf`);
      toast.success(`${numbered.length} checks made. Print them on your check stock, then mark them sent here.`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sendMark = async (list: Payment[], ref: string) => {
    setBusy(ref);
    try {
      await markSent(list.map((p) => p.id), userId, `${ref} ${new Date().toISOString().slice(0, 10)}`);
      toast.success('Marked sent.');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const list = () => saveFile(new Blob([toCsv(['Person', 'How paid', 'Account', 'Check number', 'Amount', 'Status'], paymentListRows(payments))], { type: 'text/csv;charset=utf-8' }), `payment_list_${run.pay_date}.csv`);

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Pay the people</h3>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-1.5 h-4 w-4" />Bank settings</Button>
      </div>

      {payments.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Set up how each person is paid. Anyone with bank details on file gets a direct deposit; everyone else gets a check.</p>
          <LoadingButton className="h-11 bg-primary text-primary-foreground hover:bg-primary/90" loading={setup.isPending} onClick={() => setup.mutate()}><Landmark className="mr-2 h-4 w-4" />Set up payments</LoadingButton>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>How paid</TableHead><TableHead>Account or check</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const hasBank = !!bank?.get(p.item_id)?.account_last4;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.payee_name}</TableCell>
                      <TableCell>
                        {p.status === 'sent' || p.method === 'manual' ? METHOD_LABEL[p.method] : (
                          <Select value={p.method} onValueChange={(v) => change.mutate({ p, method: v as PayMethod })}>
                            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="direct_deposit" disabled={!hasBank}>Direct deposit{hasBank ? '' : ' (no bank details)'}</SelectItem>
                              <SelectItem value="check">Check</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.method === 'direct_deposit' ? (p.account_last4 ? `${bank?.get(p.item_id)?.bank_name ?? 'Bank'} ending ${p.account_last4}` : '') : p.method === 'check' ? (p.check_number ? `Check ${p.check_number}` : 'Number given when printed') : p.note}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(p.amount)}</TableCell>
                      <TableCell><Badge variant="outline" className={cn('rounded-sm text-xs font-normal', STATUS_CLASS[p.status])}>{PAYMENT_STATUS_LABEL[p.status]}</Badge></TableCell>
                      <TableCell className="text-right">{p.status === 'sent' && p.method !== 'manual' && <Button variant="ghost" size="sm" onClick={() => setReturning(p)}>Came back</Button>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {problems.length > 0 && (
            <ul className="space-y-1.5">
              {problems.map((m, i) => <li key={i} className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span>{m}</span></li>)}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-sm font-medium">Direct deposit: {pendingDeposits.length} waiting, {formatCurrency(total(pendingDeposits))}</p>
              <div className="flex items-end gap-2">
                <div><Label className="text-xs">Money arrives on</Label><Input type="date" className="h-10" value={effective} onChange={(e) => setEffective(e.target.value)} /></div>
                <div><Label className="text-xs">File letter</Label><Input className="h-10 w-16" maxLength={1} value={letter} onChange={(e) => setLetter(e.target.value.toUpperCase())} /></div>
                <Button variant="outline" className="h-10" disabled={pendingDeposits.length === 0 || busy === 'deposit'} onClick={downloadDeposit}>{busy === 'deposit' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Deposit file</Button>
              </div>
              <Button variant="outline" className="h-10 w-full" disabled={pendingDeposits.length === 0 || busy === 'Deposit'} onClick={() => sendMark(pendingDeposits, 'Deposit')}>I sent the deposits at my bank</Button>
            </div>
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-sm font-medium">Checks: {pendingChecks.length} waiting, {formatCurrency(total(pendingChecks))}</p>
              <Button variant="outline" className="h-10 w-full" disabled={pendingChecks.length === 0 || busy === 'checks'} onClick={printChecks}>{busy === 'checks' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Print checks</Button>
              <Button variant="outline" className="h-10 w-full" disabled={pendingChecks.length === 0 || busy === 'Check'} onClick={() => sendMark(pendingChecks, 'Check')}>I handed out the checks</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={list}><Download className="mr-1.5 h-4 w-4" />Payment list (CSV)</Button>
            <p className="text-xs text-muted-foreground">For banks that take payments typed in. It shows only the last 4 digits of any account.</p>
          </div>
        </>
      )}

      <BankSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} orgId={orgId} current={settings} onSaved={refresh} />

      <Dialog open={!!returning} onOpenChange={(v) => !v && !returned.isPending && setReturning(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payment came back?</DialogTitle><DialogDescription>{returning ? `${returning.payee_name}, ${formatCurrency(returning.amount)}. It is kept on record. After this you can change how they are paid and send it again.` : ''}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="why-returned">What happened</Label><Input id="why-returned" className="h-12" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: account closed" /></div>
          <DialogFooter>
            <Button variant="outline" className="h-12" onClick={() => setReturning(null)} disabled={returned.isPending}>Cancel</Button>
            <LoadingButton className="h-12" loading={returned.isPending} disabled={!why.trim()} onClick={() => returned.mutate()}>Mark returned</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function BankSettingsDialog({ open, onOpenChange, orgId, current, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; orgId: string | null; current?: PaymentSettings; onSaved: () => void }) {
  const [form, setForm] = useState<PaymentSettings | null>(null);
  const f = form ?? current ?? { name: '', companyId: '', bankName: '', bankRouting: '', nextCheckNumber: 1001 };
  const set = (patch: Partial<PaymentSettings>) => setForm({ ...f, ...patch });
  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      if (f.bankRouting && !routingValid(f.bankRouting.trim())) throw new Error('That bank routing number is not valid. Check all 9 digits.');
      if (f.companyId && !/^[A-Za-z0-9]{10}$/.test(f.companyId.trim())) throw new Error('The company ID must be 10 characters.');
      await savePaymentSettings(orgId, f);
    },
    onSuccess: () => { toast.success('Bank settings saved.'); setForm(null); onOpenChange(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!save.isPending) { onOpenChange(v); if (!v) setForm(null); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bank settings for direct deposit</DialogTitle><DialogDescription>These go in the deposit file. Your bank gives you the company ID when you set up direct deposit (payroll) with them. This is the company's bank, not anyone's personal account.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label>Company name on the file</Label><Input className="h-12" value={f.name} maxLength={16} onChange={(e) => set({ name: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">People see this on their bank statement. 16 characters at most.</p></div>
          <div><Label>Company ID from the bank (10 characters)</Label><Input className="h-12" value={f.companyId} maxLength={10} onChange={(e) => set({ companyId: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Bank name</Label><Input className="h-12" value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} /></div>
            <div><Label>Bank routing number</Label><Input className="h-12" inputMode="numeric" maxLength={9} value={f.bankRouting} onChange={(e) => set({ bankRouting: e.target.value.replace(/\D/g, '') })} /><p className="mt-1 text-xs text-muted-foreground">Truist's file guide lists 053101121 for the file. Confirm with Truist.</p></div>
          </div>
          <div><Label>Next check number</Label><Input className="h-12" inputMode="numeric" value={String(f.nextCheckNumber)} onChange={(e) => set({ nextCheckNumber: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <LoadingButton className="h-12 bg-primary text-primary-foreground hover:bg-primary/90" loading={save.isPending} onClick={() => save.mutate()}>Save</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
