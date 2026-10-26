import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatStrip } from '@/components/shared/StatStrip';
import { EmployerCard } from '@/components/taxhub/EmployerCard';
import { IssueRow, Line, money, type TabKey } from '@/components/taxhub/shared';
import { formatDateLong, quarterDue } from '@/lib/tax/dates';
import type { useTaxHub } from '@/hooks/useTaxHub';

type Hub = NonNullable<ReturnType<typeof useTaxHub>['data']>;

export function OverviewTab({ hub, year, onOpen }: { hub: Hub; year: number; onOpen: (t: TabKey) => void }) {
  const t = hub.totals;
  const cost = hub.wages + hub.employerTotal;
  const burden = hub.wages > 0 ? (hub.employerTotal / hub.wages) * 100 : 0;
  const net = hub.wages - hub.employeeTotal;
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = useMemo(() => {
    const list: Array<{ date: string; label: string }> = [];
    for (const y of [year, year + 1]) {
      for (const q of [1, 2, 3, 4] as const) {
        list.push({ date: quarterDue(y, q), label: `Form 941 and state quarterly returns for Q${q} ${y}` });
      }
    }
    list.push({ date: quarterDue(year, 4), label: `W-2s to employees and the SSA, Form 940, and 1099-NEC for ${year}` });
    for (const d of hub.deposits) list.push({ date: d.dueDate, label: `Deposit: ${d.label} (${money(d.amount)})` });
    return list.filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [hub.deposits, year, today]);

  const top = hub.issues.filter((i) => i.level !== 'note').slice(0, 6);

  return (
    <div className="space-y-5">
      <StatStrip
        cells={[
          { label: `Wages paid in ${year}`, value: money(hub.wages), note: `${hub.w2s.length} employee${hub.w2s.length === 1 ? '' : 's'}` },
          { label: 'Withheld from employees', value: money(hub.employeeTotal), note: 'Taxes the company holds for them' },
          { label: 'Company payroll taxes', value: money(hub.employerTotal), note: `${burden.toFixed(1)}% on top of wages` },
          { label: 'Total cost of payroll', value: money(cost), note: 'Wages plus company taxes' },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">What needs your attention</CardTitle>
            <CardDescription>Fix these before filing. Each one says where to go.</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing is blocking you. Check the Filings tab for what is due next.</p>
            ) : (
              <ul className="space-y-2">{top.map((i, idx) => <IssueRow key={idx} issue={i} onOpen={onOpen} />)}</ul>
            )}
            {hub.issues.length > top.length && <p className="mt-3 text-xs text-muted-foreground">{hub.issues.length - top.length} more are listed on the other tabs.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl"><CalendarClock className="h-5 w-5" aria-hidden />Coming up</CardTitle>
            <CardDescription>Due dates already move past weekends and federal holidays.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nothing due yet. Deposits appear once pay is recorded.</p> : (
              <ul className="divide-y">
                {upcoming.map((u, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="text-sm">{u.label}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{formatDateLong(u.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Taken from employees' pay</CardTitle>
            <CardDescription>What the company withheld. Employees receive {money(net)} after these, before any other deductions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Line label="Federal income tax" value={money(t.fit)} />
            <Line label="Social Security (6.2%)" value={money(t.ss)} />
            <Line label="Medicare (1.45%)" value={money(t.medicare)} />
            {t.addlMedicare > 0 && <Line label="Additional Medicare (0.9% over $200,000)" value={money(t.addlMedicare)} />}
            <Line label="State income tax" value={money(t.sit)} note="Only in states that tax wages" />
            {t.stateEmployeeOther > 0 && <Line label="State paid leave and care programs" value={money(t.stateEmployeeOther)} note="Washington PFML and WA Cares" />}
            <Line label="Total withheld" value={money(hub.employeeTotal)} strong />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">What the company pays on top</CardTitle>
            <CardDescription>The employer side of payroll tax. This is the real extra cost of each employee.</CardDescription>
          </CardHeader>
          <CardContent>
            <Line label="Social Security (6.2%)" value={money(t.employerSs)} />
            <Line label="Medicare (1.45%)" value={money(t.employerMedicare)} />
            <Line label="Federal unemployment (FUTA)" value={money(t.futa)} note="0.6% of the first $7,000 per employee" />
            <Line label="State unemployment" value={money(t.suta)} note="Each state's rate and wage base" />
            {t.stateEmployerOther > 0 && <Line label="State paid leave (employer share)" value={money(t.stateEmployerOther)} />}
            <Line label="Total company payroll taxes" value={money(hub.employerTotal)} strong />
            {hub.reimbursements > 0 && <p className="mt-3 text-xs text-muted-foreground">Not counted above: {money(hub.reimbursements)} of reimbursements paid under an accountable plan. They are not wages and carry no payroll tax.</p>}
          </CardContent>
        </Card>
      </div>

      <EmployerCard />

      <p className="text-xs text-muted-foreground">
        The Tax Hub uses the 2026 IRS withholding tables (Publication 15-T), Publication 15, and the 2026 General Instructions for Forms W-2 and W-3.
        It is a calculation and record-keeping tool, not tax advice: have your accountant review the first quarter and the year-end filings.
      </p>
    </div>
  );
}
