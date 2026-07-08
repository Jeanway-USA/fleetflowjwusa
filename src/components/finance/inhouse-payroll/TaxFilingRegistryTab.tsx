import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';

interface Deadline {
  form: string;
  scope: string;
  dueDate: Date;
  jurisdiction: string;
}

function buildDeadlines(today: Date): Deadline[] {
  const y = today.getFullYear();
  const raw: Omit<Deadline, 'dueDate'> & { dueDate: Date }[] = [];

  // Federal 941 quarterly (W-2 payroll taxes)
  const q941 = [
    { end: new Date(y, 2, 31), due: new Date(y, 3, 30) },
    { end: new Date(y, 5, 30), due: new Date(y, 6, 31) },
    { end: new Date(y, 8, 30), due: new Date(y, 9, 31) },
    { end: new Date(y, 11, 31), due: new Date(y + 1, 0, 31) },
  ];
  const list: Deadline[] = q941.map((q) => ({
    form: 'Form 941',
    scope: `Employer quarterly payroll (through ${format(q.end, 'MMM d')})`,
    dueDate: q.due,
    jurisdiction: 'Federal (IRS)',
  }));

  // Annual filings due Jan 31 of next year
  list.push({
    form: 'Form 940',
    scope: `Annual FUTA reconciliation (${y})`,
    dueDate: new Date(y + 1, 0, 31),
    jurisdiction: 'Federal (IRS)',
  });
  list.push({
    form: 'W-2 / 1099-NEC',
    scope: `Recipient copies & filing (${y})`,
    dueDate: new Date(y + 1, 0, 31),
    jurisdiction: 'Federal / SSA',
  });

  // Texas TWC C-3 quarterly (last day of month following quarter close)
  const twc = [
    new Date(y, 3, 30), new Date(y, 6, 31),
    new Date(y, 9, 31), new Date(y + 1, 0, 31),
  ];
  twc.forEach((d, i) => list.push({
    form: 'Form C-3',
    scope: `TX SUI (Q${i + 1} ${y})`,
    dueDate: d,
    jurisdiction: 'Texas TWC',
  }));

  // Florida RT-6 quarterly
  const flQ = [
    new Date(y, 3, 30), new Date(y, 6, 31),
    new Date(y, 9, 31), new Date(y + 1, 0, 31),
  ];
  flQ.forEach((d, i) => list.push({
    form: 'Form RT-6',
    scope: `FL reemployment (Q${i + 1} ${y})`,
    dueDate: d,
    jurisdiction: 'Florida DOR',
  }));

  return list.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function TaxFilingRegistryTab() {
  const today = new Date();
  const deadlines = useMemo(() => buildDeadlines(today), []);

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> W-2 / 1099 Audit Registry
        </CardTitle>
        <CardDescription>
          Quarterly and annual filing deadlines for federal payroll, FUTA, and state unemployment.
          Dates reflect the current federal calendar; verify observed holidays before filing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deadlines.map((d) => {
                const days = differenceInCalendarDays(d.dueDate, today);
                let badge;
                if (days < 0) badge = <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Overdue</Badge>;
                else if (days <= 30) badge = <Badge className="bg-amber-500 hover:bg-amber-600">Due in {days}d</Badge>;
                else badge = <Badge variant="secondary">In {days}d</Badge>;
                return (
                  <TableRow key={`${d.form}-${d.dueDate.toISOString()}`}>
                    <TableCell className="font-medium">{d.form}</TableCell>
                    <TableCell className="text-sm">{d.scope}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.jurisdiction}</TableCell>
                    <TableCell>{format(d.dueDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell>{badge}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
