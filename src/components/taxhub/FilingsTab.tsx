import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Line, money } from '@/components/taxhub/shared';
import { FilingCalendar } from '@/components/taxhub/FilingCalendar';
import { formatDateLong, quarterDue } from '@/lib/tax/dates';
import type { useTaxHub } from '@/hooks/useTaxHub';

type Hub = NonNullable<ReturnType<typeof useTaxHub>['data']>;

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function FilingsTab({ hub, year }: { hub: Hub; year: number }) {
  const [q, setQ] = useState('1');
  const quarter = Number(q) as 1 | 2 | 3 | 4;
  const f = hub.quarters[quarter - 1];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Federal payroll tax deposits</CardTitle>
          <CardDescription>Income tax withheld plus both halves of Social Security and Medicare, deposited with the IRS (EFTPS).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">You deposit on the {hub.schedule.schedule === 'monthly' ? 'monthly' : 'semiweekly'} schedule</p>
            <p className="text-muted-foreground">{hub.schedule.reason}</p>
            {hub.schedule.schedule === 'monthly' && <p className="mt-1 text-muted-foreground">Monthly: deposit by the 15th of the next month. If a quarter's total is under $2,500 you may pay it with Form 941 instead. If you owe $100,000 or more on any day, it is due the next business day.</p>}
            {hub.schedule.schedule === 'semiweekly' && <p className="mt-1 text-muted-foreground">Semiweekly: pay days Wednesday to Friday are due the next Wednesday; Saturday to Tuesday the next Friday. If you owe $100,000 or more on any day, it is due the next business day.</p>}
          </div>
          {hub.deposits.length === 0 ? <p className="py-2 text-sm text-muted-foreground">No pay recorded for {year} yet.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Due</TableHead><TableHead>What for</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {hub.deposits.map((d) => (
                    <TableRow key={d.dueDate + d.label}>
                      <TableCell className="whitespace-nowrap">{formatDateLong(d.dueDate)}</TableCell>
                      <TableCell>{d.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(d.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-xl">Form 941, quarterly return</CardTitle>
            <CardDescription>The figures for each line, added up from your pay records. Due {formatDateLong(quarterDue(year, quarter))}.</CardDescription>
          </div>
          <Select value={q} onValueChange={setQ}>
            <SelectTrigger className="h-11 w-36" aria-label="Quarter"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>Quarter {n}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Line label="Line 1: employees paid in the pay period with the 12th" value={f.line1Employees} />
          <Line label="Line 2: wages, tips and other compensation" value={money(f.line2Wages)} />
          <Line label="Line 3: federal income tax withheld" value={money(f.line3Fit)} />
          <Line label="Line 5a: social security wages" note="Stops at $184,500 per employee for the year" value={money(f.line5aWages)} />
          <Line label="Line 5a: tax on those wages (12.4%)" value={money(f.line5aTax)} />
          <Line label="Line 5c: Medicare wages and tips" value={money(f.line5cWages)} />
          <Line label="Line 5c: tax on those wages (2.9%)" value={money(f.line5cTax)} />
          <Line label="Line 5d: Additional Medicare Tax withheld" value={money(f.line5dTax)} />
          <Line label="Line 5e: total social security and Medicare tax" value={money(f.line5e)} />
          <Line label="Line 6: total tax before adjustments" value={money(f.line6)} strong />
          {Math.abs(f.line7Fractions) >= 0.01 && <Line label="Line 7: fractions of cents" note="The difference between the rounded return and the tax actually withheld" value={money(f.line7Fractions)} muted />}
          <p className="mt-3 text-xs text-muted-foreground">Line 13 (deposits made) comes from your EFTPS confirmations. Totals on all four Forms 941 must match the year's W-2s and W-3: the W-2 tab checks this for you.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Form 940, federal unemployment tax</CardTitle>
          <CardDescription>Filed once a year. Due {formatDateLong(quarterDue(year, 4))}. You owe it as the year goes, so it accrues on every paycheck.</CardDescription>
        </CardHeader>
        <CardContent>
          <Line label="Line 3: total pay to all employees" value={money(hub.form940.line3Total)} />
          <Line label="Line 5: pay over $7,000 per employee" value={money(hub.form940.line5OverBase)} />
          <Line label="Line 7: taxable FUTA wages" value={money(hub.form940.line7Taxable)} strong />
          <Line label="Line 8: FUTA tax (0.6%)" note="Assumes your state unemployment tax is paid on time, which earns the 5.4% credit" value={money(hub.form940.line8Tax)} />
          <p className="mt-3 text-xs text-muted-foreground">If a state owes the federal government for unemployment loans (a credit reduction state, such as California in recent years) the rate goes up for wages paid there. The Department of Labor announces those states each November. Texas and Washington are not affected.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">State returns</CardTitle>
          <CardDescription>Each state wants its own quarterly report. Unemployment tax is figured per employee on wages up to that state's wage base.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {hub.states.length === 0 && <p className="py-2 text-sm text-muted-foreground">No pay recorded for {year} yet.</p>}
          {hub.states.map((s) => (
            <div key={s.code}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-condensed text-lg font-bold">{s.info?.name ?? s.code}</h3>
                <Badge variant="outline" className="rounded-sm text-xs font-normal">Unemployment {pct(s.resolved?.sutaRate ?? 0)} on the first ${(s.resolved?.sutaWageBase ?? 0).toLocaleString()}</Badge>
                {s.resolved?.rateAssumed && <Badge variant="outline" className="rounded-sm border-warning/40 text-xs font-normal text-warning">New-employer rate assumed</Badge>}
                {s.info?.sit === 'none' ? <Badge variant="outline" className="rounded-sm text-xs font-normal">No income tax</Badge> : <Badge variant="outline" className="rounded-sm border-warning/40 text-xs font-normal text-warning">Income tax not automated</Badge>}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quarter</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Employees</TableHead><TableHead className="text-right">Wages paid</TableHead>
                      <TableHead className="text-right">Taxable wages</TableHead><TableHead className="text-right">Unemployment tax</TableHead>
                      {s.code === 'WA' && <TableHead className="text-right">Paid leave and care (withheld)</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.quarters.map((x) => (
                      <TableRow key={x.quarter}>
                        <TableCell>Q{x.quarter}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateLong(x.due)}</TableCell>
                        <TableCell className="text-right tabular-nums">{x.employees}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(x.grossWages)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(x.taxableWages)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(x.suiDue)}</TableCell>
                        {s.code === 'WA' && <TableCell className="text-right tabular-nums">{money(x.employeeProgramsWithheld)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <FilingCalendar hub={hub} year={year} />
    </div>
  );
}
