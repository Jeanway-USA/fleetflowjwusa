import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/EmptyState';
import { Users } from 'lucide-react';
import { Line, Ready, money } from '@/components/taxhub/shared';
import { calculatePayrollTaxes } from '@/lib/payroll/taxEngine';
import { FILING_STATUS_LABELS } from '@/lib/payroll/taxTables';
import { EMPTY_YTD } from '@/lib/payroll/types';
import { stateInfo } from '@/lib/tax/states';
import { sumAmounts } from '@/lib/tax/reports';
import type { Payee } from '@/lib/tax/records';
import type { useTaxHub } from '@/hooks/useTaxHub';

type Hub = NonNullable<ReturnType<typeof useTaxHub>['data']>;
type Ctx = NonNullable<ReturnType<typeof useTaxHub>['ctx']>;

const stateName = (c: string | null | undefined) => (c ? stateInfo(c)?.name ?? c : 'Not set');

export function PeopleTab({ hub, ctx, year }: { hub: Hub; ctx: Ctx; year: number }) {
  const [open, setOpen] = useState<Payee | null>(null);
  const people = hub.payees.filter((p) => p.employmentClass === 'w2' && (p.active || hub.records.some((r) => r.payeeKey === p.key)));

  const rows = people.map((p) => {
    const mine = hub.records.filter((r) => r.payeeKey === p.key);
    const a = sumAmounts(mine.map((r) => r.amounts));
    return { p, wages: mine.reduce((s, r) => s + r.wages, 0), withheld: a.fit + a.ss + a.medicare + a.addlMedicare + a.sit + a.stateEmployeeOther, employer: a.employerSs + a.employerMedicare + a.futa + a.suta + a.stateEmployerOther };
  });

  if (people.length === 0) return <EmptyState icon={Users} title="No W-2 employees yet" description="People paid on a W-2 appear here once they are set up. Their tax forms come from onboarding." />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Employees</CardTitle>
        <CardDescription>Everything here comes from the forms each person filled in during onboarding. Open a person to see how their tax is figured and to try a paycheck.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Taxed by</TableHead>
                <TableHead>Paperwork</TableHead>
                <TableHead className="text-right">Wages {year}</TableHead>
                <TableHead className="text-right">Withheld</TableHead>
                <TableHead className="text-right">Company taxes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ p, wages, withheld, employer }) => (
                <TableRow key={p.key} className="cursor-pointer" onClick={() => setOpen(p)}>
                  <TableCell>
                    <p className="font-medium">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.type === 'driver' ? 'Driver' : 'Staff'}{p.active ? '' : ', inactive'}</p>
                  </TableCell>
                  <TableCell className="text-sm">{stateName(p.profile.sitState)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Ready ok={p.hasW4}>W-4</Ready>
                      <Ready ok={p.hasStateForm}>State</Ready>
                      <Ready ok={p.hasI9}>I-9</Ready>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(wages)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(withheld)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(employer)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <PersonSheet person={open} hub={hub} ctx={ctx} onClose={() => setOpen(null)} />
    </Card>
  );
}

function PersonSheet({ person, hub, ctx, onClose }: { person: Payee | null; hub: Hub; ctx: Ctx; onClose: () => void }) {
  const [gross, setGross] = useState('1500');
  const mine = useMemo(() => (person ? hub.records.filter((r) => r.payeeKey === person.key) : []), [person, hub.records]);

  const result = useMemo(() => {
    if (!person) return null;
    const ytdWages = mine.reduce((s, r) => s + r.wages, 0);
    const code = (person.profile.workState ?? '').toUpperCase();
    const state = ctx.statesByCode.get(code) ?? null;
    const sit = person.profile.sitState ?? null;
    return calculatePayrollTaxes({
      grossTaxablePay: Math.max(0, Number(gross) || 0),
      profile: person.profile,
      config: ctx.config,
      state,
      sitStateCode: sit,
      sitStateConfig: sit ? ctx.statesByCode.get(sit.toUpperCase()) ?? null : null,
      ytd: { ...EMPTY_YTD, gross: ytdWages, socialSecurityWages: ytdWages, medicareWages: ytdWages },
      payFrequency: ctx.payFrequency,
      employerHeadcount: hub.headcount,
    });
  }, [person, mine, gross, ctx, hub.headcount]);

  const p = person;
  const work = p?.profile.workState;
  const sit = p?.profile.sitState;

  return (
    <Sheet open={!!person} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 mx-0 mt-0 static border-b px-5 pt-5 pb-4 pr-12 text-left">
          <SheetTitle className="font-condensed text-2xl">{p ? `${p.firstName} ${p.lastName}` : ''}</SheetTitle>
          <SheetDescription>How this person's taxes are figured, from their onboarding forms.</SheetDescription>
        </SheetHeader>
        {p && result && (
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section>
              <h3 className="mb-1 text-sm font-semibold">Where they are taxed</h3>
              <Line label="Income tax goes to" value={stateName(sit)} note={p.type === 'driver' ? 'A driver who works in two or more states is taxed on income only by the state they live in (49 U.S.C. 14503).' : 'Office staff are taxed by the state where they work.'} />
              <Line label="Unemployment tax goes to" value={stateName(work)} note="The state where the person is based." />
              <Line label="Pay frequency" value={ctx.payFrequency} />
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold">Federal Form W-4</h3>
              {p.hasW4 ? (
                <>
                  <Line label="Filing status" value={FILING_STATUS_LABELS[p.profile.filingStatus]} />
                  <Line label="Step 2: multiple jobs box" value={p.profile.multipleJobs ? 'Checked' : 'Not checked'} />
                  <Line label="Step 3: credits" value={money(p.profile.dependentsAmount)} />
                  <Line label="Step 4(a): other income" value={money(p.profile.otherIncome)} />
                  <Line label="Step 4(b): deductions" value={money(p.profile.deductions)} />
                  <Line label="Step 4(c): extra withholding per paycheck" value={money(p.profile.extraWithholding)} />
                </>
              ) : (
                <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">No W-4 on file. Until one is, tax is withheld as single with no adjustments, which is what the IRS requires.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Try a paycheck</h3>
              <div className="mb-3 max-w-[220px] space-y-1.5">
                <Label htmlFor="calc-gross">Taxable pay for one paycheck</Label>
                <Input id="calc-gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value.replace(/[^0-9.]/g, ''))} className="h-11" />
              </div>
              <p className="text-xs text-muted-foreground">Uses the 2026 IRS method and this person's year so far ({money(mine.reduce((s, r) => s + r.wages, 0))} paid).</p>
              <div className="mt-3 rounded-md border p-3">
                <Line label="Gross pay" value={money(result.gross)} strong />
                {result.employeeLines.map((l) => <Line key={l.key} label={l.label} note={l.note} value={`-${money(l.amount)}`} muted />)}
                <Line label="Take-home pay" value={money(result.gross - result.totalEmployeeWithholding)} strong />
              </div>
              <p className="mb-1 mt-4 text-sm font-semibold">What the company pays on this paycheck</p>
              <div className="rounded-md border p-3">
                {result.employerLines.map((l) => <Line key={l.key} label={l.label} note={l.rate ? `${(l.rate * 100).toFixed(2)}% of ${money(l.taxableWages ?? 0)}` : undefined} value={money(l.amount)} muted />)}
                <Line label="Total company cost" value={money(result.gross + result.totalEmployerLiability)} strong note={`Pay plus ${money(result.totalEmployerLiability)} in payroll taxes`} />
              </div>
              {(result.warnings ?? []).length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {(result.warnings ?? []).map((w, i) => <li key={i} className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">{w}</li>)}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
