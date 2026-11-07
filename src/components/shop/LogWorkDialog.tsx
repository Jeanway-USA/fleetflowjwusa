import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Field, FormSection } from '@/components/shared/FormParts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyName } from '@/hooks/useShop';
import { useManufacturerPMProfiles } from '@/hooks/useMaintenanceData';
import { todayLocal } from '@/lib/datetime';
import { formatCurrency } from '@/lib/formatters';
import { findDuplicate, logCompletedWork, validateLog } from '@/lib/shop/log-work';
import { fallbackSummary, invoiceFileProblem, invoiceNotes, matchTruck, parseServiceInvoice, partsFrom, type ParsedInvoice } from '@/lib/shop/invoice';
import { WORK_KINDS } from '@/lib/shop/templates';
import { workKindsFor } from '@/lib/shop/truckWork';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  truckId?: string | null;
}

const num = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;

type Reading = { state: 'idle' } | { state: 'reading'; name: string } | { state: 'done'; name: string; invoice: ParsedInvoice } | { state: 'failed'; name: string; message: string };

/**
 * Put work that is already finished into a truck's history: an oil change done last week, a vendor's repair, a tire swap from
 * last spring. Start with the vendor's invoice and it fills in what it can find (the truck, the date, what was done, who did it,
 * the parts and the cost) for you to check. It goes into the log, resets the service it covers, and keeps the invoice.
 * It never touches the open-jobs board.
 */
export function LogWorkDialog({ open, onOpenChange, truckId }: Props) {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const me = useMyName();
  const [truck, setTruck] = useState<string | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [kinds, setKinds] = useState<string[]>([]);
  const [what, setWhat] = useState('');
  const [doneBy, setDoneBy] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [cost, setCost] = useState('');
  const [odo, setOdo] = useState('');
  const [receipts, setReceipts] = useState<File[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [keepParts, setKeepParts] = useState(true);
  const [reading, setReading] = useState<Reading>({ state: 'idle' });
  /** Fields filled from the invoice that nobody has changed since. */
  const [fromInvoice, setFromInvoice] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState<{ id: string; title: string } | null>(null);
  const invoiceInput = useRef<HTMLInputElement>(null);

  const { data: profiles = [] } = useManufacturerPMProfiles();
  const { data: trucks = [] } = useQuery({
    queryKey: ['shop', 'trucks-for-log'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('trucks').select('id, unit_number, make, model, engine_make, engine_model, transmission, current_odometer').is('deleted_at', null).order('unit_number');
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setDate(todayLocal());
    setKinds([]);
    setWhat('');
    setDoneBy('');
    setInvoiceNo('');
    setCost('');
    setOdo('');
    setReceipts([]);
    setInvoiceFile(null);
    setNotes('');
    setKeepParts(true);
    setReading({ state: 'idle' });
    setFromInvoice(new Set());
    setDupe(null);
    setTruck(truckId ?? null);
  }, [open, truckId]);

  // With a single truck there is nothing to choose.
  useEffect(() => {
    if (open && !truck && trucks.length === 1) setTruck(trucks[0].id);
  }, [open, truck, trucks]);

  const selectedTruck = trucks.find((t) => t.id === truck) ?? null;
  const options = useMemo(() => workKindsFor(selectedTruck, profiles), [selectedTruck, profiles]);
  const parts = useMemo(() => (reading.state === 'done' ? partsFrom(reading.invoice) : []), [reading]);

  /** A field the person changed by hand is no longer "from the invoice". */
  const edited = (field: string) => { setDupe(null); setFromInvoice((prev) => { if (!prev.has(field)) return prev; const next = new Set(prev); next.delete(field); return next; }); };
  const hint = (field: string) => (fromInvoice.has(field) ? 'Read from the invoice. Check it.' : undefined);

  const toggle = (k: string) => {
    edited('kinds');
    setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  const readInvoice = useCallback(async (file: File) => {
    const problem = invoiceFileProblem(file);
    if (problem) { toast.error(problem); return; }
    if (!orgId) { toast.error('Your organization has not finished loading.'); return; }
    // The invoice is kept as the job's receipt whether or not it can be read.
    setReceipts((prev) => [...prev.filter((f) => f !== invoiceFile), file]);
    setInvoiceFile(file);
    setReading({ state: 'reading', name: file.name });
    try {
      const allKinds = [...WORK_KINDS, ...options].map((k) => ({ key: k.key, label: k.label }));
      const invoice = await parseServiceInvoice(file, { orgId, workKinds: Array.from(new Map(allKinds.map((k) => [k.key, k])).values()), trucks, today: todayLocal() });
      const filled = new Set<string>();
      if (invoice.workDate) { setDate(invoice.workDate); filled.add('date'); }
      const matched = matchTruck(invoice.truckUnit, trucks);
      if (matched) { setTruck(matched); filled.add('truck'); }
      if (invoice.odometer) { setOdo(String(invoice.odometer)); filled.add('odo'); }
      if (invoice.workKinds.length > 0) { setKinds(invoice.workKinds); filled.add('kinds'); }
      const summary = invoice.summary ?? fallbackSummary(invoice);
      if (summary) { setWhat(summary); filled.add('what'); }
      if (invoice.vendor) { setDoneBy(invoice.vendor); filled.add('vendor'); }
      if (invoice.invoiceNumber) { setInvoiceNo(invoice.invoiceNumber); filled.add('invoiceNo'); }
      if (invoice.cost > 0) { setCost(invoice.cost.toFixed(2)); filled.add('cost'); }
      setNotes(invoiceNotes(invoice));
      setKeepParts(true);
      setFromInvoice(filled);
      setDupe(null);
      setReading({ state: 'done', name: file.name, invoice });
    } catch (e: any) {
      setReading({ state: 'failed', name: file.name, message: e?.message ?? 'The invoice could not be read.' });
    }
  }, [orgId, options, trucks, invoiceFile]);

  const removeReceipt = (file: File) => {
    setReceipts((prev) => prev.filter((f) => f !== file));
    if (file === invoiceFile) { setInvoiceFile(null); setReading({ state: 'idle' }); setNotes(''); setFromInvoice(new Set()); }
  };

  const save = async (force: boolean) => {
    const input = {
      orgId: orgId ?? '', userName: me, truckId: truck ?? '', date, kinds,
      title: options.filter((k) => kinds.includes(k.key)).map((k) => k.label).join(' + '),
      description: what, doneBy: doneBy.trim(), cost: num(cost), odometer: odo ? num(odo) : null, receipts,
      notes: [invoiceNo.trim() && !notes.includes(`#${invoiceNo.trim()}`) ? `Invoice #${invoiceNo.trim()}` : '', notes].filter(Boolean).join('\n'),
      parts: keepParts ? parts : [],
      invoiceIndex: invoiceFile ? receipts.indexOf(invoiceFile) : undefined,
    };
    const problem = validateLog(input);
    if (problem) return toast.error(problem);
    if (!orgId) return toast.error('Your organization has not finished loading.');
    setSaving(true);
    try {
      if (!force) {
        const hit = await findDuplicate(input.truckId, date, kinds);
        if (hit) { setDupe(hit); return; }
      }
      const id = await logCompletedWork(input);
      for (const key of [['shop'], ['pm-schedule'], ['service-history'], ['maintenance-cost-mtd'], ['cost-per-mile'], ['compliance-alerts'], ['trucks'], ['active-work-orders']]) qc.invalidateQueries({ queryKey: key });
      toast.success('Added to the truck\'s history.', { action: { label: 'View', onClick: () => window.location.assign(`/shop/jobs/${id}`) } });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const invoice = reading.state === 'done' ? reading.invoice : null;
  const truckMissing = invoice && !fromInvoice.has('truck') && trucks.length > 1 && !truck;

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log work done</DialogTitle>
          <DialogDescription>For finished work: yours, a vendor's, or from before you used the app. It goes into the truck's history and resets the service it covers.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); save(!!dupe); }} className="space-y-5">
          {/* The invoice comes first: it fills in most of the rest. */}
          <section
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) readInvoice(f); }}
            className={cn('rounded-lg border border-dashed p-4 transition-colors', dragging && 'border-primary bg-primary/5')}
          >
            <input ref={invoiceInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readInvoice(f); }} />
            {reading.state === 'idle' && (
              <div className="flex flex-wrap items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Have the invoice? Start there.</p>
                  <p className="text-[13px] text-muted-foreground">Upload a PDF or a photo and we fill in what we can find. You check it before it is saved.</p>
                </div>
                <Button type="button" variant="outline" className="h-11" onClick={() => invoiceInput.current?.click()}><Upload className="mr-2 h-4 w-4" />Choose invoice</Button>
              </div>
            )}
            {reading.state === 'reading' && (
              <div className="flex items-center gap-3 text-sm"><Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /><span>Reading <strong className="font-medium">{reading.name}</strong>. This takes a few seconds.</span></div>
            )}
            {reading.state === 'done' && (
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{invoice?.invoiceNumber ? `Read invoice #${invoice.invoiceNumber}` : 'Read the invoice'}{invoice?.vendor ? ` from ${invoice.vendor}` : ''}</p>
                  <p className="text-[13px] text-muted-foreground">It filled in what it could find. Check each field before you save.</p>
                </div>
                <Button type="button" variant="outline" className="h-11" onClick={() => invoiceInput.current?.click()}>Use a different invoice</Button>
              </div>
            )}
            {reading.state === 'failed' && (
              <div className="flex flex-wrap items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">That invoice could not be read</p>
                  <p className="text-[13px] text-muted-foreground">{reading.message} It is still attached as the receipt. Fill in the rest by hand.</p>
                </div>
                <Button type="button" variant="outline" className="h-11" onClick={() => invoiceInput.current?.click()}>Try another</Button>
              </div>
            )}
            {invoice && invoice.warnings.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {invoice.warnings.map((w, i) => <li key={i} className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[13px]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /><span>{w}</span></li>)}
              </ul>
            )}
          </section>

          <FormSection title="Truck and date">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Truck" htmlFor="log-truck" hint={truckMissing ? 'No truck number was on the invoice. Choose the truck.' : hint('truck')}>
                {trucks.length === 1 ? (
                  <p id="log-truck" className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm"><span className="truncate">{trucks[0].unit_number} {[trucks[0].make, trucks[0].model].filter(Boolean).join(' ')}</span></p>
                ) : (
                  <Select value={truck ?? ''} onValueChange={(v) => { setTruck(v); edited('truck'); }}>
                    <SelectTrigger id="log-truck" className={cn(truckMissing && 'border-warning')}><SelectValue placeholder="Choose a truck" /></SelectTrigger>
                    <SelectContent>{trucks.map((t) => <SelectItem key={t.id} value={t.id}>{t.unit_number}{[t.make, t.model].filter(Boolean).length ? ` · ${[t.make, t.model].filter(Boolean).join(' ')}` : ''}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </Field>
              <Field label="Date it was done" htmlFor="log-date" hint={hint('date')}>
                <Input id="log-date" type="date" max={todayLocal()} value={date} onChange={(e) => { setDate(e.target.value); edited('date'); }} />
              </Field>
              <Field label="Odometer (optional)" htmlFor="log-odo" hint={hint('odo')}>
                <Input id="log-odo" inputMode="numeric" value={odo} onChange={(e) => { setOdo(e.target.value.replace(/[^0-9]/g, '')); edited('odo'); }} placeholder="Miles at the time" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="What was done" description={fromInvoice.has('kinds') || fromInvoice.has('what') ? 'Read from the invoice. Check it.' : undefined}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[...options, ...kinds.filter((key) => !options.some((k) => k.key === key)).map((key) => ({ key, label: key.replace(/_/g, ' '), tasks: [] as string[] }))].map((k) => (
                <button key={k.key} type="button" aria-pressed={kinds.includes(k.key)} onClick={() => toggle(k.key)} className={cn('h-9 rounded-md border px-3 text-sm transition-colors', kinds.includes(k.key) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>{k.label}</button>
              ))}
            </div>
            <Textarea value={what} onChange={(e) => { setWhat(e.target.value); edited('what'); }} rows={3} placeholder="Details: what was replaced, what was found, anything worth remembering" />
          </FormSection>

          <FormSection title="Who and how much">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Who did it (optional)" htmlFor="log-vendor" hint={hint('vendor')}>
                <Input id="log-vendor" value={doneBy} onChange={(e) => { setDoneBy(e.target.value); edited('vendor'); }} placeholder="Me, or the shop's name" />
              </Field>
              <Field label="Invoice number (optional)" htmlFor="log-invoice" hint={hint('invoiceNo')}>
                <Input id="log-invoice" value={invoiceNo} onChange={(e) => { setInvoiceNo(e.target.value); edited('invoiceNo'); }} />
              </Field>
              <Field label="Total cost" htmlFor="log-cost" hint={hint('cost')}>
                <Input id="log-cost" inputMode="decimal" value={cost} onChange={(e) => { setCost(e.target.value); edited('cost'); }} placeholder="0.00" />
              </Field>
            </div>
            {invoice && invoice.lines.length > 0 && (
              <p className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
                On the invoice: {[
                  invoice.byKind.part ? `parts ${formatCurrency(invoice.byKind.part)}` : '',
                  invoice.byKind.labor ? `labor ${formatCurrency(invoice.byKind.labor)}` : '',
                  invoice.byKind.fee ? `fees ${formatCurrency(invoice.byKind.fee)}` : '',
                  invoice.tax ? `tax ${formatCurrency(invoice.tax)}` : '',
                  invoice.discount ? `discount -${formatCurrency(invoice.discount)}` : '',
                ].filter(Boolean).join(', ')}.{' '}
                {invoice.math.ok === true && <span className="text-success">The items add up to the total.</span>}
                {invoice.math.ok === false && <span className="text-warning">The items do not add up to the total.</span>}
              </p>
            )}
          </FormSection>

          {parts.length > 0 && (
            <FormSection title="Parts" description="Saved with the job as the parts used. They do not change your parts room stock.">
              <label className="mb-2 flex items-center gap-2 text-sm"><Checkbox checked={keepParts} onCheckedChange={(v) => setKeepParts(v === true)} />Save these {parts.length} parts with the job</label>
              <ul className={cn('divide-y rounded-lg border text-sm', !keepParts && 'opacity-50')}>
                {parts.slice(0, 8).map((p, i) => (
                  <li key={i} className="flex items-baseline gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{p.name}{p.number ? <span className="text-muted-foreground"> · {p.number}</span> : null}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{p.quantity} × {formatCurrency(p.unitCost)}</span>
                  </li>
                ))}
                {parts.length > 8 && <li className="px-3 py-2 text-muted-foreground">and {parts.length - 8} more</li>}
              </ul>
            </FormSection>
          )}

          <FormSection title="Receipt or photos" description={invoiceFile ? 'The invoice is kept with the job.' : undefined}>
            <label className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-sm font-medium hover:bg-accent">
              <Paperclip className="h-4 w-4" />Add a photo or scan
              <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => { setReceipts((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
            </label>
            {receipts.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {receipts.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    {f === invoiceFile && <span className="shrink-0 text-xs text-muted-foreground">Invoice</span>}
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeReceipt(f)}><X className="h-4 w-4 text-muted-foreground" /></button>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>

          {dupe && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-warning">This may already be logged</p>
              <p className="mt-0.5 text-muted-foreground">There is already a finished job on this truck for {date}: <Link className="text-primary underline" to={`/shop/jobs/${dupe.id}`}>{dupe.title}</Link>. Save it anyway only if it is a different job.</p>
            </div>
          )}

          <DialogFooter className="sticky -bottom-4 z-10 -mx-4 mt-6 flex-row justify-end gap-2 border-t bg-background px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:space-x-0 sm:px-6">
            <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <LoadingButton type="submit" loading={saving} disabled={saving || reading.state === 'reading'} className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none">{dupe ? 'Save it anyway' : 'Add to history'}</LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
