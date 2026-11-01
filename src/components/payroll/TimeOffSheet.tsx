import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { todayLocal } from '@/lib/datetime';
import { balanceOn, canTake, sickUsableFrom, type EntryType, type TimeOffKind } from '@/lib/payroll/timeOff';
import { addEntry, archiveEntry, fetchEntries, KIND_LABEL } from '@/lib/payroll/timeOffStore';
import { loadPayees } from '@/lib/tax/records';

const KEY = ['payroll-time-off'];
const h = (n: number) => `${Math.round(n * 100) / 100}`;

/** Paid sick leave and time off for staff: balances, leave taken, and corrections. Leave taken is paid in that week's staff pay. */
export function TimeOffSheet({ open, onOpenChange, orgId, userId }: { open: boolean; onOpenChange: (v: boolean) => void; orgId: string | null; userId: string | null }) {
  const qc = useQueryClient();
  const [personKey, setPersonKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ kind: TimeOffKind; type: EntryType; hours: string; date: string; note: string }>({ kind: 'sick', type: 'use', hours: '', date: todayLocal(), note: '' });

  const { data: payees = [] } = useQuery({ queryKey: ['payroll-time-off-payees', orgId], queryFn: () => loadPayees(orgId as string), enabled: open && !!orgId });
  const staff = useMemo(() => payees.filter((p) => p.type === 'employee' && p.userId).sort((a, b) => Number(b.active) - Number(a.active) || `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)), [payees]);
  const person = staff.find((p) => p.key === personKey);
  const { data: entries = [], isLoading } = useQuery({ queryKey: [...KEY, person?.userId], queryFn: () => fetchEntries(orgId as string, person!.userId as string), enabled: open && !!orgId && !!person });

  const today = todayLocal();
  const balances = (['sick', 'pto', 'holiday'] as const).map((k) => ({ kind: k, ...balanceOn(entries, k, today) }));
  const shown = balances.filter((b) => b.kind === 'sick' || b.available !== 0 || entries.some((e) => e.kind === b.kind));
  const sickFrom = sickUsableFrom(person?.hireDate);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId || !person?.userId) return;
      const hours = Number(form.hours);
      if (!(hours > 0)) throw new Error('Enter the number of hours.');
      if (form.type === 'use') {
        const check = canTake({ kind: form.kind, hours, date: form.date, hireDate: person.hireDate, available: balanceOn(entries, form.kind, form.date).available });
        if (!check.ok) throw new Error(check.reason);
      }
      await addEntry({ orgId, userId: person.userId, createdBy: userId, kind: form.kind, type: form.type, hours, date: form.date, note: form.note });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); setAdding(false); setForm({ ...form, hours: '', note: '' }); toast.success('Saved.'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => archiveEntry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Removed from the balance. It stays on record.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Time off</SheetTitle>
            <SheetDescription>Washington staff earn 1 hour of paid sick leave for every 40 hours worked. It is added automatically when pay is made. Leave taken is paid in that week's staff pay.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Person</Label>
              <Select value={personKey} onValueChange={setPersonKey}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                <SelectContent>{staff.map((p) => <SelectItem key={p.key} value={p.key}>{p.firstName} {p.lastName}{p.active ? '' : ' (inactive)'}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {person && (isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
              <>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {shown.map((b) => (
                    <li key={b.kind} className="rounded-lg border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{KIND_LABEL[b.kind]}</p>
                      <p className="font-condensed text-2xl font-bold tabular-nums">{h(b.available)} <span className="text-sm font-normal text-muted-foreground">hours</span></p>
                      <p className="text-xs text-muted-foreground">{h(b.earnedThisYear)} earned and {h(b.usedThisYear)} used this year{b.carriedIn > 0 ? `, ${h(b.carriedIn)} carried in` : ''}{b.lostAtYearStart > 0 ? `, ${h(b.lostAtYearStart)} over the 40-hour limit expired Jan 1` : ''}</p>
                    </li>
                  ))}
                </ul>
                {person.hireDate ? (
                  <p className="text-xs text-muted-foreground">Hired {person.hireDate}. Sick leave can be used from {sickFrom}.</p>
                ) : (
                  <p className="text-xs text-warning">No hire date on file, so the 90-day wait for sick leave is not checked.</p>
                )}

                <Button className="h-12 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Record leave or add hours</Button>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">History</h3>
                  {entries.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : (
                    <ul className="space-y-1.5">
                      {[...entries].reverse().map((e) => (
                        <li key={e.id} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
                          <span className="w-24 shrink-0 text-muted-foreground">{e.effective_date}</span>
                          <span className="min-w-0 flex-1 truncate">{KIND_LABEL[e.kind]} · {e.entry_type === 'accrual' ? 'earned' : e.entry_type === 'use' ? 'taken' : 'correction'}{e.note ? ` · ${e.note}` : ''}</span>
                          <span className="w-16 text-right tabular-nums font-medium">{e.hours > 0 ? '+' : ''}{h(e.hours)}</span>
                          {e.entry_type !== 'accrual' && <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(e.id)}>Remove</Button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={adding} onOpenChange={(v) => !save.isPending && setAdding(v)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record leave or add hours</DialogTitle><DialogDescription>{person ? `For ${person.firstName} ${person.lastName}.` : ''}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as TimeOffKind })}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>{(['sick', 'pto', 'holiday'] as const).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>What</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as EntryType })}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="use">Leave taken (paid)</SelectItem><SelectItem value="adjustment">Add hours (grant or correction)</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Hours</Label><Input className="h-12" inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
              <div><Label>Date</Label><Input className="h-12" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div><Label>Note (optional)</Label><Input className="h-12" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            {form.type === 'use' && <p className="text-xs text-muted-foreground">Paid at their hourly rate in the staff pay for the week it falls in. If that week's pay already exists as a draft, make it again.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-12" onClick={() => setAdding(false)} disabled={save.isPending}>Cancel</Button>
            <LoadingButton className="h-12 bg-primary text-primary-foreground hover:bg-primary/90" loading={save.isPending} onClick={() => save.mutate()}>Save</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
