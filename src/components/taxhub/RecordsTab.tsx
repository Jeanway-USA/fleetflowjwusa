import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toCsv } from '@/lib/csv';
import type { useTaxHub } from '@/hooks/useTaxHub';

type Hub = NonNullable<ReturnType<typeof useTaxHub>['data']>;

const download = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const KEEP: Array<[string, string]> = [
  ['Form W-4 for every employee', 'Keep as long as it is in effect and at least four years after the last return that used it.'],
  ['Form I-9 for every employee', 'Three years after the hire date or one year after employment ends, whichever is later.'],
  ['Payroll register, pay records and deposit confirmations', 'At least four years after the tax is due or paid (IRS Publication 15).'],
  ['Copies of every Form 941, Form 940, W-2, W-3 and 1099', 'At least four years.'],
  ['State unemployment and withholding returns and rate notices', 'Keep as long as the state requires. Four years is a safe rule.'],
  ['Accountable-plan receipts for reimbursed expenses', 'Keep each receipt. Reimbursements are only untaxed when the employee shows what the money was spent on.'],
];

export function RecordsTab({ hub, year }: { hub: Hub; year: number }) {
  const register = () => download(`payroll_register_${year}.csv`, toCsv(
    ['Pay date', 'Employee', 'Source', 'Taxable wages', 'Reimbursements (not wages)', 'Federal income tax', 'Social security', 'Medicare', 'Additional Medicare', 'State income tax', 'State paid leave/care withheld', 'Employer social security', 'Employer Medicare', 'FUTA', 'State unemployment', 'Employer state programs', 'Taxes saved when paid?'],
    hub.records.map((r) => {
      const p = hub.payees.find((x) => x.key === r.payeeKey);
      const a = r.amounts;
      return [r.payDate, p ? `${p.firstName} ${p.lastName}` : r.payeeKey, r.source, r.wages, r.nonTaxable, a.fit, a.ss, a.medicare, a.addlMedicare, a.sit, a.stateEmployeeOther, a.employerSs, a.employerMedicare, a.futa, a.suta, a.stateEmployerOther, r.recorded ? 'Yes' : 'No, calculated by the Tax Hub'];
    }),
  ));

  const w2s = () => download(`w2_totals_${year}.csv`, toCsv(
    ['Employee', 'Box 1 wages', 'Box 2 federal tax', 'Box 3 SS wages', 'Box 4 SS tax', 'Box 5 Medicare wages', 'Box 6 Medicare tax', 'State', 'Box 16 state wages', 'Box 17 state tax'],
    hub.w2s.flatMap((w) => {
      const base = [`${w.payee.firstName} ${w.payee.lastName}`, w.box1, w.box2, w.box3, w.box4, w.box5, w.box6];
      return w.states.length === 0 ? [[...base, '', '', '']] : w.states.map((s) => [...base, s.code, s.wages, s.tax]);
    }),
  ));

  const quarters = () => download(`form_941_summary_${year}.csv`, toCsv(
    ['Quarter', 'Due', 'Employees (line 1)', 'Wages (line 2)', 'Income tax withheld (line 3)', 'SS wages (5a)', 'SS tax (5a)', 'Medicare tax (5c)', 'Additional Medicare (5d)', 'Total before adjustments (line 6)'],
    hub.quarters.map((q) => [`Q${q.quarter}`, q.due, q.line1Employees, q.line2Wages, q.line3Fit, q.line5aWages, q.line5aTax, q.line5cTax, q.line5dTax, q.line6]),
  ));

  const states = () => download(`state_liability_${year}.csv`, toCsv(
    ['State', 'Quarter', 'Due', 'Employees', 'Wages paid', 'Taxable wages', 'Rate', 'Rate assumed?', 'Unemployment tax', 'Income tax withheld', 'Employee programs withheld', 'Employer programs owed'],
    hub.states.flatMap((s) => s.quarters.map((x) => [s.code, `Q${x.quarter}`, x.due, x.employees, x.grossWages, x.taxableWages, x.rate, x.rateAssumed ? 'Yes' : 'No', x.suiDue, x.incomeTaxWithheld, x.employeeProgramsWithheld, x.employerProgramsOwed])),
  ));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Company records for {year}</CardTitle>
          <CardDescription>Reports for your accountant, an audit, or your own files. Everything is built from the same pay records the filings use, so the totals agree.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {[
            ['Payroll register', 'Every payment with every tax, one line each', register],
            ['W-2 totals', 'One line per employee and state, in W-2 box order', w2s],
            ['Form 941 summary', 'Each quarter with the numbers for every line', quarters],
            ['State liability', 'Wages, unemployment tax and withholding by state and quarter', states],
          ].map(([title, text, fn]) => (
            <div key={title as string} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0"><p className="text-sm font-medium">{title as string}</p><p className="text-xs text-muted-foreground">{text as string}</p></div>
              <Button variant="outline" className="h-11 shrink-0" onClick={fn as () => void} disabled={hub.records.length === 0}><Download className="mr-2 h-4 w-4" />CSV</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">What to keep, and for how long</CardTitle>
          <CardDescription>The onboarding flow already stores each employee's W-4, I-9 and state form. These are the rest.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {KEEP.map(([what, how]) => (
              <li key={what} className="py-2.5"><p className="text-sm font-medium">{what}</p><p className="text-sm text-muted-foreground">{how}</p></li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Company setup checklist</CardTitle>
          <CardDescription>The registrations a company with employees needs. The Tax Hub cannot check these for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>An Employer Identification Number (EIN) from the IRS, entered on the Overview tab.</li>
            <li>An EFTPS account (www.eftps.gov) to make federal tax deposits.</li>
            <li>For each state where you have employees: an unemployment insurance account, a withholding account if the state taxes wages, and the state new-hire reporting registration.</li>
            <li>Workers' compensation insurance for employees. Some states, such as Washington, charge it by the hour, so keep hours records there.</li>
            <li>Accountable plan: a written rule that you reimburse only business expenses an employee documents (parking, tolls, receipts) and that they return any extra. Reimbursements that follow it are not wages. Money paid without receipts is wages and is taxed.</li>
            <li>Keep the Landstar settlement, your payroll and your bank records tied together: Landstar pays the company, and the company pays its employees.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
