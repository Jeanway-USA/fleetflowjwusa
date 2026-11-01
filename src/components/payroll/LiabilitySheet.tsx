import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfQuarter, format, startOfQuarter } from 'date-fns';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toCsv } from '@/lib/csv';
import { todayLocal } from '@/lib/datetime';
import { formatCurrency } from '@/lib/formatters';
import { taxLiability } from '@/lib/payroll/journal';
import { fetchRunItems, fetchRuns } from '@/lib/payroll/payRun';
import { loadRunStubs } from '@/lib/payroll/stubs';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** What is owed to the IRS and the state for approved and paid runs with a payday in a date range. */
export function LiabilitySheet({ open, onOpenChange, orgId }: { open: boolean; onOpenChange: (v: boolean) => void; orgId: string | null }) {
  const now = new Date();
  const [from, setFrom] = useState(iso(startOfQuarter(now)));
  const [to, setTo] = useState(iso(endOfQuarter(now)));

  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll-liability', orgId, from, to],
    enabled: open && !!orgId && from <= to,
    queryFn: async () => {
      const runs = (await fetchRuns()).filter((r) => (r.status === 'approved' || r.status === 'paid') && r.pay_date >= from && r.pay_date <= to);
      const stubs = [];
      for (const run of runs) stubs.push(...(await loadRunStubs(run, await fetchRunItems(run.id), orgId as string)));
      return { runs: runs.length, people: stubs.length, ...taxLiability(stubs) };
    },
  });

  const csv = () => {
    if (!data) return;
    const blob = new Blob([toCsv(['Tax', 'Withheld from pay', 'Company share', 'Total owed', 'Where it is paid'], [...data.rows.map((r) => [r.group, r.employee, r.employer, r.total, r.note]), ['Total', '', '', data.total, '']])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taxes_owed_${from}_to_${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Taxes owed</SheetTitle>
          <SheetDescription>What the payroll taxes add up to for approved and paid runs, by payday. Use it to plan IRS and state deposits. Drafts are not counted.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Paydays from</Label><Input className="h-12" type="date" value={from} max={todayLocal()} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>to</Label><Input className="h-12" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          {from > to && <p className="text-sm text-destructive">The start date is after the end date.</p>}
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : data && (
            data.runs === 0 ? <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No approved or paid runs with a payday in this range.</p> : (
              <>
                <p className="text-sm text-muted-foreground">{data.runs} {data.runs === 1 ? 'run' : 'runs'}, {data.people} pay {data.people === 1 ? 'stub' : 'stubs'}.</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Tax</TableHead><TableHead className="text-right">From pay</TableHead><TableHead className="text-right">Company</TableHead><TableHead className="text-right">Owed</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.rows.map((r) => (
                        <TableRow key={r.group}>
                          <TableCell><p className="font-medium">{r.group}</p><p className="text-xs text-muted-foreground">{r.note}</p></TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(r.employee)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(r.employer)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(r.total)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow><TableCell className="font-semibold">Total</TableCell><TableCell /><TableCell /><TableCell className="text-right tabular-nums font-semibold">{formatCurrency(data.total)}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" className="h-11" onClick={csv}><Download className="mr-2 h-4 w-4" />Download (CSV)</Button>
                <p className="text-xs text-muted-foreground">The IRS deposit schedule (monthly or semiweekly) depends on the company's lookback total, which is not decided here. The Tax Hub shows the quarterly forms.</p>
              </>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
