import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/shared/EmptyState';
import { Line, Ready, money } from '@/components/taxhub/shared';
import { generateFilingSheetPdf, generateW2Pdf } from '@/lib/pdf/generateW2Pdf';
import { formatDateLong, quarterDue } from '@/lib/tax/dates';
import { w2Readiness, type W2Data } from '@/lib/tax/reports';
import type { useTaxHub } from '@/hooks/useTaxHub';
import type { EmployerInfo } from '@/hooks/useTaxHubData';

type Hub = NonNullable<ReturnType<typeof useTaxHub>['data']>;

const save = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

/** Reads the full Social Security number through the audited database function. Only owners and payroll admins get it. */
async function fetchSsn(w2: W2Data): Promise<string | null> {
  const fn = w2.payee.type === 'driver' ? 'get_driver_ssn' : 'get_employee_ssn';
  const arg = w2.payee.type === 'driver' ? { _driver_id: w2.payee.id } : { _employee_id: w2.payee.id };
  const { data, error } = await supabase.rpc(fn as never, arg as never);
  if (error) return null;
  return (data as string | null) ?? null;
}

export function W2Tab({ hub, year, employer, stateIds }: { hub: Hub; year: number; employer: EmployerInfo | undefined; stateIds: Record<string, string> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const employerOk = !!(employer?.name && employer?.ein && employer?.address_line1 && employer?.city && employer?.state && employer?.zip);
  const due = quarterDue(year, 4);

  const recon = useMemo(() => {
    const sum = (f: (w: W2Data) => number) => Math.round(hub.w2s.reduce((s, w) => s + f(w), 0) * 100) / 100;
    const q = (f: (x: Hub['quarters'][number]) => number) => Math.round(hub.quarters.reduce((s, x) => s + f(x), 0) * 100) / 100;
    const rows = [
      { label: 'Wages (W-2 box 1, Form 941 line 2)', w2: sum((w) => w.box1), f941: q((x) => x.line2Wages) },
      { label: 'Federal income tax withheld (box 2, line 3)', w2: sum((w) => w.box2), f941: q((x) => x.line3Fit) },
      { label: 'Social security wages (box 3, line 5a)', w2: sum((w) => w.box3), f941: q((x) => x.line5aWages) },
      { label: 'Medicare wages (box 5, line 5c)', w2: sum((w) => w.box5), f941: q((x) => x.line5cWages) },
    ];
    return rows.map((r) => ({ ...r, ok: Math.abs(r.w2 - r.f941) < 0.02 }));
  }, [hub.w2s, hub.quarters]);

  const stateIdMap = stateIds;
  const generateOne = async (w2: W2Data) => {
    if (!employerOk || !employer) return toast.error('Finish the company details first.');
    setBusy(w2.payee.key);
    try {
      const blob = generateW2Pdf({ year, employer, w2, stateIds: stateIdMap, includeEmployerCopy: true });
      save(blob, `W2_${year}_${w2.payee.lastName}_${w2.payee.firstName}.pdf`);
    } finally { setBusy(null); }
  };

  const generateAll = async () => {
    for (const w of hub.w2s) await generateOne(w);
  };

  const filingSheet = async () => {
    if (!employerOk || !employer) return toast.error('Finish the company details first.');
    setBusy('sheet');
    try {
      const forms = [];
      for (const w2 of hub.w2s) forms.push({ w2, ssnFull: await fetchSsn(w2), stateIds: stateIdMap });
      if (forms.some((f) => !f.ssnFull)) toast.warning('Some Social Security numbers could not be read. They are marked MISSING on the sheet.');
      save(generateFilingSheetPdf({ year, employer, forms, stateIds: stateIdMap }), `W2_filing_worksheet_${year}.pdf`);
    } finally { setBusy(null); }
  };

  if (hub.w2s.length === 0) return <EmptyState icon={FileText} title={`No W-2 wages for ${year} yet`} description="W-2s appear here once W-2 employees have been paid. Pay counts on the day it is paid." />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{year} W-2s</CardTitle>
          <CardDescription>
            Due to employees and to the Social Security Administration by {formatDateLong(due)}. Pay counts in the year it was paid, so December pay paid in January belongs to next year's W-2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {year !== 2026 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>These copies follow the 2026 IRS form</AlertTitle>
              <AlertDescription>The IRS changes the form and its specifications each year. Check IRS Publication 1141 for {year} before printing.</AlertDescription>
            </Alert>
          )}
          {!employerOk && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Company details are incomplete</AlertTitle>
              <AlertDescription>Add the legal name, EIN and full address on the Overview tab before printing W-2s.</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" onClick={generateAll} disabled={!employerOk || !!busy}><Download className="mr-2 h-4 w-4" />Employee copies for everyone</Button>
            <Button className="h-11" variant="outline" onClick={filingSheet} disabled={!employerOk || !!busy}>
              {busy === 'sheet' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Filing worksheet for the SSA
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">1 Wages</TableHead>
                  <TableHead className="text-right">2 Fed. tax</TableHead>
                  <TableHead className="text-right">3 SS wages</TableHead>
                  <TableHead className="text-right">4 SS tax</TableHead>
                  <TableHead className="text-right">5 Medicare wages</TableHead>
                  <TableHead className="text-right">6 Medicare tax</TableHead>
                  <TableHead>State (15 to 17)</TableHead>
                  <TableHead>Ready?</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Print</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hub.w2s.map((w) => {
                  const basics = w2Readiness(w, employerOk);
                  const blockers = hub.issues.filter((i) => i.level === 'fix' && i.payeeKey === w.payee.key).map((i) => i.title.replace(`${w.payee.firstName} ${w.payee.lastName}: `, ''));
                  const missing = [...basics, ...blockers.filter((b) => !basics.includes(b))];
                  return (
                    <TableRow key={w.payee.key}>
                      <TableCell className="font-medium">{w.payee.firstName} {w.payee.lastName}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(w.box1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(w.box2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(w.box3)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(w.box4)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(w.box5)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(w.box6)}</TableCell>
                      <TableCell className="text-sm">{w.states.length === 0 ? <span className="text-muted-foreground">None</span> : w.states.map((s) => `${s.code} ${money(s.tax)}`).join(', ')}</TableCell>
                      <TableCell>{missing.length === 0 ? <Ready ok>Ready</Ready> : <div className="flex flex-col gap-1"><Ready ok={false}>Needs {missing.length}</Ready><span className="max-w-[260px] text-xs text-muted-foreground">{missing.join('; ')}</span></div>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-10" disabled={!employerOk || !!busy} onClick={() => generateOne(w)}>
                          {busy === w.payee.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}W-2
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Do the W-2s match the four Forms 941?</CardTitle>
          <CardDescription>The IRS and SSA compare them. A mismatch brings letters, so settle any difference before filing.</CardDescription>
        </CardHeader>
        <CardContent>
          {recon.map((r) => (
            <Line key={r.label} label={r.label} note={r.ok ? undefined : `W-2s ${money(r.w2)} against Forms 941 ${money(r.f941)}`} value={<span className={r.ok ? 'text-success' : 'text-destructive'}>{r.ok ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />{money(r.w2)}</span> : <span className="inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{money(r.w2 - r.f941)} off</span>}</span>} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">How to file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="font-medium">Employees.</span> The employee copies (B, C and 2) follow IRS Publication 1141 for substitute forms: white paper, black ink, one copy per page, with the notice and instructions printed behind each. Give or mail them by {formatDateLong(due)}. Copy D is yours to keep for four years.</p>
          <p><span className="font-medium">The Social Security Administration (Copy A).</span> Copy A cannot be printed on plain paper. File it free online at <span className="font-mono text-xs">www.ssa.gov/bso</span> using W-2 Online (up to 50 forms at a time). Employers with 10 or more information returns must file electronically. The filing worksheet lists every box in the order the website asks for it and the Form W-3 totals to check against. SSA builds the W-3 for you.</p>
          <p><span className="font-medium">State.</span> States with an income tax want copies too; Texas and Washington do not tax wages, so no state boxes are filled in for people taxed there.</p>
          <p><span className="font-medium">Mistakes.</span> A wrong name, number or amount is fixed with Form W-2c, not by filing a new W-2. Do not write "corrected" on a resubmission.</p>
        </CardContent>
      </Card>
    </div>
  );
}
