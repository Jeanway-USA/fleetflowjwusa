import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Line, money } from '@/components/taxhub/shared';
import { STATE_CODES, STATE_INFO, stateInfo, WA_2026 } from '@/lib/tax/states';
import type { SavedStateRow, useTaxHub } from '@/hooks/useTaxHub';

type Hub = NonNullable<ReturnType<typeof useTaxHub>['data']>;

const pct = (n: number | null) => (n == null ? 'Set by industry' : `${(n * 100).toFixed(2)}%`);

export function StatesTab({ hub, saved }: { hub: Hub; saved: SavedStateRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState<string>('');
  const inUse = new Set(hub.states.map((s) => s.code));
  const shown = [...inUse, ...(pick && !inUse.has(pick) ? [pick] : [])];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Your states</CardTitle>
          <CardDescription>Every state where you pay people. Add the rate and account numbers each state mails you after you register.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {shown.length === 0 && <p className="py-2 text-sm text-muted-foreground">No pay is recorded yet. Pick a state below to see what hiring there involves.</p>}
          {shown.map((code) => <StateCard key={code} code={code} hub={hub} saved={saved.find((s) => s.code === code) ?? null} onEdit={() => setEditing(code)} planning={!inUse.has(code)} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Thinking of hiring in another state?</CardTitle>
          <CardDescription>Pick a state to see what it requires before the first paycheck.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-11 max-w-sm" aria-label="State"><SelectValue placeholder="Choose a state" /></SelectTrigger>
            <SelectContent>{STATE_CODES.map((c) => <SelectItem key={c} value={c}>{STATE_INFO[c].name}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">How every state is handled</CardTitle>
          <CardDescription>Automatic means the Tax Hub works the amount out on every paycheck. Manual means the state has the tax but its method is not built in yet, so the hub tells you instead of guessing.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>State</TableHead><TableHead>Income tax on wages</TableHead><TableHead className="text-right">Unemployment wage base (2026)</TableHead><TableHead className="text-right">New-employer rate</TableHead><TableHead>Other payroll programs</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {STATE_CODES.map((c) => {
                  const i = STATE_INFO[c];
                  return (
                    <TableRow key={c}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell>{i.sit === 'none' ? <Badge variant="outline" className="rounded-sm text-xs font-normal">None: automatic</Badge> : <Badge variant="outline" className="rounded-sm border-warning/40 text-xs font-normal text-warning">Manual</Badge>}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(i.suiWageBase)}</TableCell>
                      <TableCell className="text-right">{pct(i.newEmployerRate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.programs.length === 0 ? 'None listed' : i.programs.map((p) => `${p.label}${p.status === 'automated' ? ' (automatic)' : ''}`).join('; ')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <StateSheet code={editing} saved={saved.find((s) => s.code === editing) ?? null} onClose={() => setEditing(null)} />
    </div>
  );
}

function StateCard({ code, hub, saved, onEdit, planning }: { code: string; hub: Hub; saved: SavedStateRow | null; onEdit: () => void; planning: boolean }) {
  const info = stateInfo(code);
  const row = hub.states.find((s) => s.code === code);
  if (!info) return null;
  const rate = row?.resolved?.sutaRate ?? info.newEmployerRate ?? 0;
  const assumed = row?.resolved?.rateAssumed ?? !(Number(saved?.suta_rate) > 0);
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-condensed text-xl font-bold">{info.name}</h3>
        {planning && <Badge variant="outline" className="rounded-sm text-xs font-normal">Not hiring here yet</Badge>}
        <Button size="sm" variant="outline" className="ml-auto h-10" onClick={onEdit}>{planning ? 'Save details' : 'Edit'}</Button>
      </div>
      {info.note && <p className="mb-2 text-sm text-muted-foreground">{info.note}</p>}
      <Line label="Income tax withholding" value={info.sit === 'none' ? 'None: nothing to withhold' : 'Not automatic: use the state\'s tables'} />
      <Line label="Unemployment tax rate" note={assumed ? (info.newEmployerRate == null ? 'No rate assumed: enter the rate from the state\'s letter' : 'New-employer rate, until the state assigns yours') : 'The rate you entered'} value={rate > 0 ? pct(rate) : 'Not set'} />
      <Line label="Unemployment wage base" note={info.confirmWageBase ? 'Sources disagreed: confirm with the state' : undefined} value={money(info.suiWageBase)} />
      <Line label="Unemployment account number" value={saved?.suta_account_number || <span className="text-warning">Not saved</span>} />
      {info.programs.map((p) => <Line key={p.key} label={p.label} note={p.note} value={p.status === 'automated' ? 'Automatic' : <span className="text-warning">Manual</span>} />)}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">Before the first paycheck in {info.name}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Register with {info.name}'s unemployment insurance agency and get an account number and rate notice.</li>
          {info.sit !== 'none' && <li>Register for state income tax withholding and learn how often to deposit it.</li>}
          <li>Report each new hire to the state new-hire registry. Federal law allows 20 days from the hire date; some states allow less.</li>
          <li>Collect the state's withholding form from the employee (the onboarding flow already asks for the state form).</li>
          {code === 'WA' && <li>Register with Washington Employment Security (unemployment and paid leave) and with the Department of Labor & Industries for workers' compensation.</li>}
        </ul>
      </details>
    </div>
  );
}

function StateSheet({ code, saved, onClose }: { code: string | null; saved: SavedStateRow | null; onClose: () => void }) {
  const { orgId } = useAuth();
  const qc = useQueryClient();
  const info = stateInfo(code);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);

  if (code && loaded !== code) {
    setLoaded(code);
    setForm({
      suta_rate: saved?.suta_rate ? String((saved.suta_rate * 100).toFixed(4)).replace(/\.?0+$/, '') : '',
      suta_account_number: saved?.suta_account_number ?? '',
      sit_account_number: saved?.sit_account_number ?? '',
      sit_rate: saved?.sit_rate ? String((saved.sit_rate * 100).toFixed(4)).replace(/\.?0+$/, '') : '',
      deposit_frequency: saved?.deposit_frequency ?? '',
      agency_notes: saved?.agency_notes ?? '',
    });
  }
  if (!code && loaded) setLoaded(null);

  const save = async () => {
    if (!orgId || !code || !info) return;
    setBusy(true);
    try {
      const rate = form.suta_rate ? Number(form.suta_rate) / 100 : 0;
      const sit = form.sit_rate ? Number(form.sit_rate) / 100 : 0;
      if (rate < 0 || rate > 0.15) throw new Error('The unemployment rate looks wrong. Enter it as a percent, for example 2.7.');
      const { error } = await supabase.from('state_tax_configurations' as never).upsert({
        org_id: orgId, state_code: code, suta_rate: rate, suta_wage_base: info.suiWageBase,
        has_state_income_tax: info.sit !== 'none' && sit > 0, sit_rate: info.sit === 'none' ? 0 : sit,
        suta_account_number: form.suta_account_number || null, sit_account_number: form.sit_account_number || null,
        deposit_frequency: form.deposit_frequency || null, agency_notes: form.agency_notes || null,
      } as never, { onConflict: 'org_id,state_code' } as never);
      if (error) throw error;
      toast.success(`${info.name} saved`);
      for (const key of [['taxhub-saved-states'], ['tax_year_config'], ['payroll_config']]) qc.invalidateQueries({ queryKey: key });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save');
    } finally { setBusy(false); }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Sheet open={!!code} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 mx-0 mt-0 static border-b px-5 pt-5 pb-4 pr-12 text-left">
          <SheetTitle className="font-condensed text-2xl">{info?.name}</SheetTitle>
          <SheetDescription>What the state told you when you registered. Rates and account numbers are specific to your company.</SheetDescription>
        </SheetHeader>
        {info && (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="suta">Your unemployment tax rate (%)</Label>
              <Input id="suta" inputMode="decimal" className="h-11" value={form.suta_rate ?? ''} onChange={set('suta_rate')} placeholder={info.newEmployerRate ? `${(info.newEmployerRate * 100).toFixed(2)} (new-employer rate)` : 'From the state\'s rate notice'} />
              <p className="text-xs text-muted-foreground">Leave blank to keep using the new-employer rate{info.newEmployerRate == null ? ' (this state has none, so enter yours)' : ''}.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suta-acct">Unemployment account number</Label>
              <Input id="suta-acct" className="h-11" value={form.suta_account_number ?? ''} onChange={set('suta_account_number')} />
            </div>
            {info.sit !== 'none' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="sit-acct">State income tax withholding account number</Label>
                  <Input id="sit-acct" className="h-11" value={form.sit_account_number ?? ''} onChange={set('sit_account_number')} />
                  <p className="text-xs text-muted-foreground">Also printed in box 15 of W-2s for people taxed by this state.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sit-rate">Flat estimate for state income tax (%), optional</Label>
                  <Input id="sit-rate" inputMode="decimal" className="h-11" value={form.sit_rate ?? ''} onChange={set('sit_rate')} />
                  <p className="text-xs text-muted-foreground">{info.name}'s withholding method is not built in. Without an estimate nothing is withheld and you are warned. An estimate is labeled "estimate" everywhere and is not the state's official method.</p>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>How often you deposit state tax</Label>
              <Select value={form.deposit_frequency || undefined} onValueChange={(v) => setForm({ ...form, deposit_frequency: v })}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="semiweekly">Semiweekly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={form.agency_notes ?? ''} onChange={set('agency_notes')} placeholder="Agency contact, login hints, anything the next person needs" />
            </div>
            {code === 'WA' && <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">Washington paid leave: {(WA_2026.pfmlTotalRate * 100).toFixed(2)}% of wages, {(WA_2026.pfmlEmployeeShare * 100).toFixed(2)}% paid by the employee. The employer share applies from {WA_2026.employerShareMinHeadcount} employees. WA Cares: {(WA_2026.caresRate * 100).toFixed(2)}% paid by the employee.</p>}
          </div>
        )}
        <SheetFooter className="shrink-0 gap-2 border-t px-5 py-4">
          <Button variant="outline" className="h-12" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="h-12" onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
