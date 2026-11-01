import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Banknote, CheckCircle2, Download, FileText, Info, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatStrip } from '@/components/shared/StatStrip';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { DeductionsSheet } from '@/components/payroll/DeductionsSheet';
import { PaymentsSection } from '@/components/payroll/PaymentsSection';
import { TimeOffSheet } from '@/components/payroll/TimeOffSheet';
import { RunHistory } from '@/components/payroll/RunHistory';
import { LiabilitySheet } from '@/components/payroll/LiabilitySheet';
import { NewHireCard } from '@/components/payroll/NewHireCard';
import { isMissingTables } from '@/hooks/usePayPackages';
import { useEmployerInfo } from '@/hooks/useTaxHubData';
import { toCsv } from '@/lib/csv';
import { generatePayStubsPdf, generateRegisterPdf } from '@/lib/pdf/generatePayStubsPdf';
import { loadRunStubs, registerRows } from '@/lib/payroll/stubs';
import { journalFor } from '@/lib/payroll/journal';
import { createOffCycleRun, OFF_CYCLE_KIND_LABEL, summarizeOffCycle, validateOffCycle, type OffCycleKind, type OffCycleLine } from '@/lib/payroll/offCycle';
import { loadPayees } from '@/lib/tax/records';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { todayLocal } from '@/lib/datetime';
import { formatCurrency } from '@/lib/formatters';
import { approveRun, canApprove, createPayRun, fetchRunItems, fetchRuns, markRunPaid, reviewItems, suggestedPeriods, voidApprovedRun, voidDraftRun, type PayRun, type RunStatus } from '@/lib/payroll/payRun';
import { cn } from '@/lib/utils';

const KEY = ['pay-runs'] as const;
const day = (d: string | null) => (d ? format(parseISO(d), 'MMM d') : '');
const dayLong = (d: string | null) => (d ? format(parseISO(d), 'EEE, MMM d, yyyy') : '');

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-border text-muted-foreground' },
  approved: { label: 'Approved', className: 'border-primary/40 text-primary' },
  paid: { label: 'Paid', className: 'border-success/40 text-success' },
  void: { label: 'Voided', className: 'border-destructive/40 text-destructive' },
};

/** One screen to pay everyone: start a run for a payday, check it, approve it, mark it paid. Approved runs lock. */
export default function Payroll() {
  const { orgId, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState<PayRun | null>(null);
  const [creating, setCreating] = useState(false);
  const [offCycle, setOffCycle] = useState(false);
  const [deductions, setDeductions] = useState(false);
  const [timeOff, setTimeOff] = useState(false);
  const [liability, setLiability] = useState(false);

  const { data: runs = [], isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchRuns, retry: false });
  const current = runs.find((r) => r.id === open?.id) ?? open;

  if (error) {
    return (
      <div>
        <PageHeader title="Payroll" description="Pay everyone in one run" />
        <EmptyState icon={Banknote} title={isMissingTables(error) || /pay_runs/.test((error as Error).message) ? 'Pay runs are not switched on yet' : 'Payroll could not load'} description={/pay_runs|schema cache|does not exist|relation/i.test((error as Error).message) ? 'The database update for pay runs has not been applied yet.' : (error as Error).message} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Payroll" description="One run pays everyone: drivers and staff, with taxes, for one payday">
        <Button variant="outline" className="h-11" onClick={() => setLiability(true)}>Taxes owed</Button>
        <Button variant="outline" className="h-11" onClick={() => setTimeOff(true)}>Time off</Button>
        <Button variant="outline" className="h-11" onClick={() => setDeductions(true)}>Deductions</Button>
        <Button variant="outline" className="h-11" onClick={() => setOffCycle(true)}>Off-cycle pay</Button>
        <Button className="h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New pay run</Button>
      </PageHeader>

      <NewHireCard orgId={orgId} userId={user?.id ?? null} />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : runs.length === 0 ? (
        <EmptyState icon={Banknote} title="No pay runs yet" description="Start a run for your next payday. It makes everyone's pay, takes out taxes, and lets you check it before anything is approved." />
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent">
                <div className="min-w-[180px]">
                  <p className="font-condensed text-xl font-bold leading-tight">{dayLong(r.pay_date)}</p>
                  <p className="text-xs text-muted-foreground">{r.run_type === 'off_cycle' ? (r.note ?? 'Off-cycle payment') : `Drivers ${day(r.driver_period_start)} to ${day(r.driver_period_end)} · Staff ${day(r.staff_period_start)} to ${day(r.staff_period_end)}`}</p>
                </div>
                <Badge variant="outline" className={cn('rounded-sm text-xs font-normal', STATUS[r.status].className)}>{STATUS[r.status].label}</Badge>
                {r.run_type === 'off_cycle' && <Badge variant="outline" className="rounded-sm text-xs font-normal">Off-cycle</Badge>}
                <div className="ml-auto flex gap-6 text-sm">
                  <span><span className="block text-xs text-muted-foreground">People</span><span className="tabular-nums">{r.totals?.people ?? 0}</span></span>
                  <span><span className="block text-xs text-muted-foreground">Gross</span><span className="tabular-nums">{formatCurrency(r.totals?.gross ?? 0)}</span></span>
                  <span><span className="block text-xs text-muted-foreground">Taxes</span><span className="tabular-nums">{formatCurrency(r.totals?.taxes ?? 0)}</span></span>
                  <span><span className="block text-xs text-muted-foreground">Take-home</span><span className="tabular-nums font-semibold">{formatCurrency(r.totals?.net ?? 0)}</span></span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NewRunDialog open={creating} onOpenChange={setCreating} orgId={orgId} userId={user?.id ?? null} onCreated={(id) => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['driver_settlements'] }); qc.invalidateQueries({ queryKey: ['staff-pay-statements'] }); setCreating(false); fetchRuns().then((all) => setOpen(all.find((r) => r.id === id) ?? null)); }} />
      <OffCycleDialog open={offCycle} onOpenChange={setOffCycle} orgId={orgId} userId={user?.id ?? null} onCreated={(id) => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['driver_settlements'] }); qc.invalidateQueries({ queryKey: ['staff-pay-statements'] }); setOffCycle(false); fetchRuns().then((all) => setOpen(all.find((r) => r.id === id) ?? null)); }} />
      <LiabilitySheet open={liability} onOpenChange={setLiability} orgId={orgId} />
      <TimeOffSheet open={timeOff} onOpenChange={setTimeOff} orgId={orgId} userId={user?.id ?? null} />
      <DeductionsSheet open={deductions} onOpenChange={setDeductions} orgId={orgId} userId={user?.id ?? null} />
      <RunSheet run={current} userId={user?.id ?? null} onClose={() => setOpen(null)} />
    </div>
  );
}

function OffCycleDialog({ open, onOpenChange, orgId, userId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; orgId: string | null; userId: string | null; onCreated: (id: string) => void }) {
  const [personKey, setPersonKey] = useState('');
  const [payDate, setPayDate] = useState(todayLocal());
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Array<{ kind: OffCycleKind; label: string; amount: string }>>([{ kind: 'earning', label: '', amount: '' }]);
  const { data: payees = [] } = useQuery({ queryKey: ['payroll-payees', orgId], enabled: open && !!orgId, queryFn: () => loadPayees(orgId!) });
  const people = payees.filter((p) => p.active && (p.type === 'driver' || p.userId));
  const parsed: OffCycleLine[] = lines.map((l) => ({ kind: l.kind, label: l.label, amount: Number(l.amount) || 0 }));
  const problem = validateOffCycle({ payDate, reason, lines: parsed });
  const sum = summarizeOffCycle(parsed);
  const person = people.find((p) => p.key === personKey);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !person) throw new Error('Choose who is being paid.');
      return createOffCycleRun({ orgId, userId, payDate, reason, payee: person, lines: parsed });
    },
    onSuccess: ({ runId }) => { toast.success('Off-cycle pay made. Check it before approving.'); setLines([{ kind: 'earning', label: '', amount: '' }]); setReason(''); onCreated(runId); },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (i: number, patch: Partial<{ kind: OffCycleKind; label: string; amount: string }>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open={open} onOpenChange={(v) => !create.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-condensed text-2xl">Off-cycle pay</DialogTitle>
          <DialogDescription>Pay one person outside the regular payday: a bonus, back pay, a correction or a reimbursement. Income tax is withheld at the flat 22% rate used for bonuses.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Who is being paid</Label>
              <Select value={personKey} onValueChange={setPersonKey}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                <SelectContent>{people.map((p) => <SelectItem key={p.key} value={p.key}>{p.firstName} {p.lastName} ({p.type === 'driver' ? 'driver' : 'staff'})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ocd">Pay date</Label><Input id="ocd" type="date" className="h-11" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ocr">Why</Label><Textarea id="ocr" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Safety bonus for the quarter, or: underpaid on the Oct 22 week by $100" /></div>
          <div className="space-y-2">
            <Label>Lines</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2 sm:grid-cols-[170px_1fr_110px_auto]">
                <Select value={l.kind} onValueChange={(v) => set(i, { kind: v as OffCycleKind })}>
                  <SelectTrigger className="h-11 col-span-2 sm:col-span-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(OFF_CYCLE_KIND_LABEL) as OffCycleKind[]).map((k) => <SelectItem key={k} value={k}>{OFF_CYCLE_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="h-11" placeholder="Description" value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
                <Input className="h-11" inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^0-9.]/g, '') })} />
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" className="h-10" onClick={() => setLines([...lines, { kind: 'earning', label: '', amount: '' }])}><Plus className="mr-1.5 h-4 w-4" />Add a line</Button>
          </div>
          <p className="text-xs text-muted-foreground">Pay {formatCurrency(sum.earnings)}, reimbursed {formatCurrency(sum.reimbursements)}, deductions {formatCurrency(sum.deductions)}. Taxes are worked out when you make it, and you can check them before anything is approved.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <LoadingButton loading={create.isPending} disabled={create.isPending || !person || !!problem} className="h-12 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => create.mutate()}>Make the payment</LoadingButton>
        </DialogFooter>
        {problem && person && <p className="text-xs text-muted-foreground">{problem}</p>}
      </DialogContent>
    </Dialog>
  );
}

function NewRunDialog({ open, onOpenChange, orgId, userId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; orgId: string | null; userId: string | null; onCreated: (id: string) => void }) {
  const [payDate, setPayDate] = useState(todayLocal());
  const periods = useMemo(() => suggestedPeriods(parseISO(payDate || todayLocal())), [payDate]);
  const [driverStart, setDriverStart] = useState<string | null>(null);
  const [driverEnd, setDriverEnd] = useState<string | null>(null);
  const [staffStart, setStaffStart] = useState<string | null>(null);
  const [staffEnd, setStaffEnd] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Your organization has not finished loading.');
      return createPayRun({
        orgId, userId, payDate, note,
        periods: { driver: { start: driverStart ?? periods.driver.start, end: driverEnd ?? periods.driver.end }, staff: { start: staffStart ?? periods.staff.start, end: staffEnd ?? periods.staff.end } },
      });
    },
    onSuccess: ({ runId }) => { toast.success('Pay run made. Check it before approving.'); onCreated(runId); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reset = () => { setDriverStart(null); setDriverEnd(null); setStaffStart(null); setStaffEnd(null); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-condensed text-2xl">New pay run</DialogTitle>
          <DialogDescription>Pick the payday. The pay periods are filled in for you: drivers for their Landstar week, staff for the last Monday to Sunday week.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5 sm:max-w-[220px]">
            <Label htmlFor="pd">Payday</Label>
            <Input id="pd" type="date" className="h-11" value={payDate} onChange={(e) => { setPayDate(e.target.value); reset(); }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Drivers: week from</Label><Input type="date" className="h-11" value={driverStart ?? periods.driver.start} onChange={(e) => setDriverStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>to</Label><Input type="date" className="h-11" value={driverEnd ?? periods.driver.end} onChange={(e) => setDriverEnd(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Staff: week from</Label><Input type="date" className="h-11" value={staffStart ?? periods.staff.start} onChange={(e) => setStaffStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>to</Label><Input type="date" className="h-11" value={staffEnd ?? periods.staff.end} onChange={(e) => setStaffEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <p className="flex gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" />Making the run prepares draft pay for every active driver and every staff member on a pay package. Nothing is approved or paid until you do it on the next screen.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <LoadingButton loading={create.isPending} disabled={create.isPending || !payDate} className="h-12 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => create.mutate()}>Make the pay run</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const saveFile = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

function RunSheet({ run, userId, onClose }: { run: PayRun | null; userId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const employer = useEmployerInfo();
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'pay' | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  const { data: items = [], isLoading } = useQuery({ queryKey: [...KEY, run?.id, 'items'], enabled: !!run, queryFn: () => fetchRunItems(run!.id) });
  const issues = useMemo(() => reviewItems(items), [items]);
  const blocked = !canApprove(issues);

  const refresh = () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['driver_settlements'] }); qc.invalidateQueries({ queryKey: ['staff-pay-statements'] }); };
  const approve = useMutation({ mutationFn: () => approveRun(run!, userId), onSuccess: () => { toast.success('Pay run approved and locked.'); setConfirm(null); refresh(); }, onError: (e: Error) => { setConfirm(null); toast.error(e.message); } });
  const pay = useMutation({ mutationFn: () => markRunPaid(run!, userId), onSuccess: () => { toast.success('Marked paid.'); setConfirm(null); refresh(); }, onError: (e: Error) => { setConfirm(null); toast.error(e.message); } });
  const voidRun = useMutation({ mutationFn: () => (run!.status === 'approved' ? voidApprovedRun(run!, userId, reason) : voidDraftRun(run!, userId, reason)), onSuccess: () => { toast.success(run?.status === 'approved' ? 'Run voided. Its pay was archived. You can start a new run for the same payday.' : 'Draft run voided. Its draft pay was archived.'); setVoiding(false); setReason(''); refresh(); onClose(); }, onError: (e: Error) => toast.error(e.message) });

  /** Pay stubs, the register as a PDF, or the register as a spreadsheet, all from the saved pay in this run. */
  const makeDoc = async (kind: 'stubs' | 'register' | 'csv' | 'journal') => {
    if (!run || !orgId) return;
    const e = employer.data;
    const block = { name: e?.name ?? null, ein: e?.ein ?? null, address_line1: e?.address_line1 ?? null, address_line2: e?.address_line2 ?? null, city: e?.city ?? null, state: e?.state ?? null, zip: e?.zip ?? null };
    setDocBusy(kind);
    try {
      const stubs = await loadRunStubs(run, items, orgId);
      if (stubs.length === 0) { toast.info('There is no pay in this run yet.'); return; }
      if (kind === 'journal') {
        const j = journalFor(stubs);
        if (!j.balanced) toast.warning('The journal does not balance. A figure on a pay stub is wrong. Check before importing it.');
        saveFile(new Blob([toCsv(['Account', 'Debit', 'Credit'], [...j.lines.map((l) => [l.account, l.debit || '', l.credit || '']), ['Total', j.totalDebit, j.totalCredit]])], { type: 'text/csv;charset=utf-8' }), `payroll_journal_${run.pay_date}.csv`);
      } else if (kind === 'stubs') saveFile(generatePayStubsPdf(stubs, block), `pay_stubs_${run.pay_date}.pdf`);
      else if (kind === 'register') saveFile(generateRegisterPdf(stubs, run, block), `payroll_register_${run.pay_date}.pdf`);
      else {
        const rows = registerRows(stubs);
        saveFile(new Blob([toCsv(['Person', 'Type', 'Period', 'Gross pay', 'Reimbursed', 'Taxes withheld', 'Deductions', 'Take-home', 'Employer taxes', 'Year-to-date gross'], rows.map((r) => [r.name, r.kind, r.period, r.gross, r.nonTaxable, r.taxTotal, r.deductionTotal, r.net, r.employerTotal, r.ytdGross]))], { type: 'text/csv;charset=utf-8' }), `payroll_register_${run.pay_date}.csv`);
      }
    } catch (err) {
      toast.error((err as Error).message || 'Could not make the file');
    } finally {
      setDocBusy(null);
    }
  };

  const t = run?.totals;
  const skipped = run?.totals?.skipped ?? [];
  const busy = approve.isPending || pay.isPending;

  return (
    <Sheet open={!!run} onOpenChange={(v) => !v && !busy && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="shrink-0 mx-0 mt-0 static border-b px-5 pt-5 pb-4 pr-12 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="font-condensed text-2xl">Pay run for {run ? dayLong(run.pay_date) : ''}</SheetTitle>
            {run && <Badge variant="outline" className={cn('rounded-sm text-xs font-normal', STATUS[run.status].className)}>{STATUS[run.status].label}</Badge>}
            {run && run.status !== 'draft' && run.status !== 'void' && <Lock className="h-4 w-4 text-muted-foreground" aria-label="Locked" />}
          </div>
          <SheetDescription>{run ? (run.run_type === 'off_cycle' ? `Off-cycle payment: ${run.note ?? ''}` : `Drivers paid for ${day(run.driver_period_start)} to ${day(run.driver_period_end)}. Staff paid for ${day(run.staff_period_start)} to ${day(run.staff_period_end)}.`) : ''}</SheetDescription>
        </SheetHeader>

        {run && (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <StatStrip cells={[
              { label: 'People', value: String(t?.people ?? 0) },
              { label: 'Gross pay', value: formatCurrency(t?.gross ?? 0), note: t?.nonTaxable ? `plus ${formatCurrency(t.nonTaxable)} reimbursed` : undefined },
              { label: 'Taxes withheld', value: formatCurrency(t?.taxes ?? 0) },
              { label: 'Take-home pay', value: formatCurrency(t?.net ?? 0) },
            ]} />

            {run.status === 'void' && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">Voided. {run.void_reason}</p>}

            <RunHistory run={run} />

            {run.status !== 'void' && items.length > 0 && (
              <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <span className="mr-auto text-sm font-medium">Paperwork{run.status === 'draft' ? ' (marked draft until approved)' : ''}</span>
                <Button variant="outline" className="h-11" disabled={!!docBusy} onClick={() => makeDoc('stubs')}>{docBusy === 'stubs' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Pay stubs</Button>
                <Button variant="outline" className="h-11" disabled={!!docBusy} onClick={() => makeDoc('register')}>{docBusy === 'register' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Register (PDF)</Button>
                <Button variant="outline" className="h-11" disabled={!!docBusy} onClick={() => makeDoc('csv')}>{docBusy === 'csv' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Register (CSV)</Button>
                <Button variant="outline" className="h-11" disabled={!!docBusy} onClick={() => makeDoc('journal')}>{docBusy === 'journal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Journal entry (CSV)</Button>
              </section>
            )}

            {(run.status === 'approved' || run.status === 'paid') && items.length > 0 && (
              <PaymentsSection run={run} items={items} orgId={orgId} userId={userId} employer={{ name: employer.data?.name ?? null, ein: employer.data?.ein ?? null, address_line1: employer.data?.address_line1 ?? null, address_line2: employer.data?.address_line2 ?? null, city: employer.data?.city ?? null, state: employer.data?.state ?? null, zip: employer.data?.zip ?? null }} />
            )}

            {run.status === 'draft' && issues.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Check before approving</h3>
                <ul className="space-y-1.5">
                  {issues.map((i, idx) => (
                    <li key={idx} className={cn('flex gap-2 rounded-md border p-2.5 text-sm', i.level === 'block' ? 'border-destructive/40 bg-destructive/5' : 'border-warning/40 bg-warning/5')}>
                      <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', i.level === 'block' ? 'text-destructive' : 'text-warning')} />
                      <span><span className="font-medium">{i.who}.</span> {i.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {skipped.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Not in this run</h3>
                <ul className="space-y-1 text-sm">{skipped.map((s, i) => <li key={i} className="rounded-md border bg-muted/30 p-2.5"><span className="font-medium">{s.name}.</span> <span className="text-muted-foreground">{s.reason}</span></li>)}</ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold">Everyone in the run</h3>
              {isLoading ? <Skeleton className="h-24" /> : items.length === 0 ? <p className="text-sm text-muted-foreground">No one is in this run.</p> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Paid through</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Reimbursed</TableHead><TableHead className="text-right">Taxes</TableHead><TableHead className="text-right">Deductions</TableHead><TableHead className="text-right">Take-home</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {items.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.payee_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{i.source === 'settlement' ? 'Driver settlement' : 'Staff statement'}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(i.gross)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(i.non_taxable)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(i.taxes)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(i.deductions)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(i.net)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Open a person's settlement under Money, Payroll, or their staff statement under Settings, to see each line. Anything changed after the run was made is caught when you approve.</p>
            </section>
          </div>
        )}

        {run && run.status !== 'void' && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t bg-background px-5 py-4">
            {run.status === 'draft' && (
              <>
                <Button variant="outline" className="h-12" onClick={() => setVoiding(true)} disabled={busy}>Void this draft</Button>
                <Button className="h-12 flex-1 bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none" disabled={blocked || items.length === 0 || busy} onClick={() => setConfirm('approve')}><CheckCircle2 className="mr-2 h-4 w-4" />Approve and lock</Button>
              </>
            )}
            {run.status === 'approved' && (
              <>
                <Button variant="outline" className="h-12" onClick={() => setVoiding(true)} disabled={busy}>Void this run</Button>
                <Button className="h-12 bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={() => setConfirm('pay')}><Banknote className="mr-2 h-4 w-4" />Mark as paid</Button>
              </>
            )}
            {run.status === 'paid' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />Paid and locked{run.paid_at ? ` on ${format(parseISO(run.paid_at), 'MMM d, yyyy')}` : ''}.</p>}
            {run.status === 'draft' && blocked && <p className="self-center text-xs text-destructive">Fix the items above before approving.</p>}
          </div>
        )}

        <AlertDialog open={!!confirm} onOpenChange={(v) => !v && !busy && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm === 'approve' ? `Approve pay for ${t?.people ?? 0} people?` : `Mark ${t?.people ?? 0} people as paid?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm === 'approve'
                  ? `Take-home pay of ${formatCurrency(t?.net ?? 0)} with ${formatCurrency(t?.taxes ?? 0)} withheld. The run locks: its numbers can no longer change.`
                  : 'Do this after the money has actually been sent. Paid pay counts toward each person\'s W-2 and the quarterly tax returns.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); (confirm === 'approve' ? approve : pay).mutate(); }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{confirm === 'approve' ? 'Approve and lock' : 'Mark as paid'}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={voiding} onOpenChange={(v) => !voidRun.isPending && setVoiding(v)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{run?.status === 'approved' ? 'Void this approved run?' : 'Void this draft run?'}</DialogTitle><DialogDescription>{run?.status === 'approved' ? 'Use this when a mistake is found before the money goes out. The pay in it is archived, not deleted, and unsent payments are cancelled. If money was already sent it is refused. You can start a new run for the same payday.' : 'The draft pay in it is archived, not deleted. You can start a new run for the same payday.'}</DialogDescription></DialogHeader>
            <div className="space-y-1.5"><Label htmlFor="why">Why</Label><Textarea id="why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" className="h-12" onClick={() => setVoiding(false)} disabled={voidRun.isPending}>Cancel</Button>
              <LoadingButton loading={voidRun.isPending} disabled={voidRun.isPending || !reason.trim()} className="h-12" onClick={() => voidRun.mutate()}>Void the run</LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
